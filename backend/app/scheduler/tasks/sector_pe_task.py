"""S&P 500 sector P/E scraper task.

Scrapes worldperatio.com for current sector P/E ratios and propagates
them to the `sectors.average_pe` column. The `sectors` table is keyed
per-symbol with a sector classification, so a single scraped value updates
every symbol within that sector.

Eventually folds into a metadata-refresh pipeline alongside
metadata_scraper_task and the rsi update.
"""
import logging
from typing import List, Tuple

import requests
from bs4 import BeautifulSoup
from sqlalchemy import text

from app.db.session import get_db

logger = logging.getLogger(__name__)

URL = "https://worldperatio.com/sp-500-sectors/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HTTP_TIMEOUT = 15

# Scraped name -> internal DB name. Add entries when worldperatio.com
# emits a label that doesn't match what's in the `sectors` table.
SECTOR_NAME_MAPPING = {
    "Health Care": "Healthcare",
    "Information Technology": "Tech",
}

# Table class fallbacks, most-specific first
TABLE_CLASS_CANDIDATES = [
    "money home-all sortable w3-table -f14 pd44",
    "money",
    "sortable",
]


def fetch_sector_pe_html(url: str = URL, timeout: int = HTTP_TIMEOUT) -> str:
    """Fetch the sector P/E page. Raises on HTTP errors."""
    resp = requests.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.text


def parse_sector_pe(html: str) -> List[Tuple[str, float]]:
    """Pull (sector, P/E) tuples out of the page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = None
    for cls in TABLE_CLASS_CANDIDATES:
        table = soup.find("table", class_=cls)
        if table is not None:
            logger.info(f"Sector P/E: matched table class '{cls}'")
            break
    if table is None:
        logger.error("Sector P/E: no candidate table found on page")
        return []

    tbody = table.find("tbody")
    if tbody is None:
        logger.error("Sector P/E: table found but has no tbody")
        return []

    rows: List[Tuple[str, float]] = []
    for tr in tbody.find_all("tr"):
        cols = tr.find_all("td")
        if len(cols) < 5:
            continue
        sector_name = cols[2].text.strip()
        pe_text = cols[3].text.strip()
        try:
            pe = float(pe_text)
        except ValueError:
            logger.warning(
                f"Sector P/E: skip {sector_name!r}: P/E text {pe_text!r} not numeric"
            )
            continue
        rows.append((sector_name, pe))

    return rows


def apply_sector_mapping(rows: List[Tuple[str, float]]) -> List[Tuple[str, float]]:
    """Rewrite scraped sector names to match internal DB names."""
    mapped_rows: List[Tuple[str, float]] = []
    for name, pe in rows:
        mapped = SECTOR_NAME_MAPPING.get(name, name)
        if mapped != name:
            logger.info(f"Sector P/E: mapped {name!r} -> {mapped!r}")
        mapped_rows.append((mapped, pe))
    return mapped_rows


def update_sector_pe() -> bool:
    """Scrape, parse, map, and write to sectors.average_pe."""
    try:
        html = fetch_sector_pe_html()
    except requests.RequestException as e:
        logger.error(f"Sector P/E: fetch failed: {e}")
        return False

    rows = parse_sector_pe(html)
    if not rows:
        logger.error("Sector P/E: no rows parsed; aborting")
        return False

    rows = apply_sector_mapping(rows)
    logger.info(f"Sector P/E: parsed {len(rows)} sectors from page")

    db = next(get_db())
    try:
        db_sectors = {
            r[0]
            for r in db.execute(
                text("SELECT DISTINCT sector FROM sectors WHERE sector IS NOT NULL")
            ).fetchall()
        }

        scraped = {name for name, _ in rows}
        missing_in_db = scraped - db_sectors
        missing_on_page = db_sectors - scraped
        if missing_in_db:
            logger.warning(
                f"Sector P/E: scraped sectors not in DB "
                f"(mapping needed?): {sorted(missing_in_db)}"
            )
        if missing_on_page:
            logger.info(
                f"Sector P/E: DB sectors with no page match: {sorted(missing_on_page)}"
            )

        sectors_updated = 0
        rows_affected = 0
        for sector_name, pe in rows:
            res = db.execute(
                text("UPDATE sectors SET average_pe = :pe WHERE sector = :s"),
                {"pe": pe, "s": sector_name},
            )
            if res.rowcount > 0:
                sectors_updated += 1
                rows_affected += res.rowcount
                logger.info(
                    f"Sector P/E: {sector_name} -> {pe} ({res.rowcount} symbol rows)"
                )

        db.commit()
        logger.info(
            f"Sector P/E update complete: {sectors_updated}/{len(rows)} sectors matched, "
            f"{rows_affected} symbol rows touched"
        )
        return True

    except Exception as e:
        logger.exception(f"Sector P/E: DB update failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()
