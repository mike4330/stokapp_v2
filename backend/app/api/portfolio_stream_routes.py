"""
Portfolio value streaming endpoint using Server-Sent Events (SSE).

This module provides real-time portfolio value updates to connected clients.
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import AsyncGenerator
import json

from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared queue for portfolio value updates
portfolio_value_queue: asyncio.Queue = None


def initialize_portfolio_queue():
    """Initialize the portfolio value queue."""
    global portfolio_value_queue
    if portfolio_value_queue is None:
        portfolio_value_queue = asyncio.Queue()
        logger.info("Portfolio value queue initialized")


def calculate_portfolio_value(db: Session) -> float:
    """
    Calculate the current total portfolio value.

    This mirrors the logic in /api/holdings endpoint, calculating holdings
    from the transactions table and multiplying by current prices.
    """
    query = text("""
        SELECT
            t.symbol,
            SUM(CASE
                WHEN t.units_remaining IS NULL THEN t.units
                ELSE t.units_remaining
            END) as net_units,
            p.price
        FROM transactions t
        JOIN prices p ON t.symbol = p.symbol
        WHERE t.xtype = 'Buy'
        AND t.disposition IS NULL
        GROUP BY t.symbol, p.price
        HAVING net_units > 0
    """)

    results = db.execute(query).fetchall()
    total_value = sum(float(row[1]) * float(row[2]) for row in results if row[1] and row[2])

    return total_value


def notify_portfolio_update(value: float):
    """
    Notify all connected clients of a portfolio value update.
    This is called by the price_updater_task after updating prices.
    """
    global portfolio_value_queue
    if portfolio_value_queue is not None:
        try:
            # Put without waiting (non-blocking for scheduler thread)
            portfolio_value_queue.put_nowait({
                "total_value": value,
                "timestamp": asyncio.get_event_loop().time()
            })
            logger.debug(f"Portfolio value update queued: ${value:,.2f}")
        except asyncio.QueueFull:
            logger.warning("Portfolio value queue is full, dropping update")
        except RuntimeError:
            # No event loop in this thread, skip queueing
            logger.debug("No event loop available for queueing update")


async def portfolio_value_stream(db: Session) -> AsyncGenerator[str, None]:
    """
    Generate SSE stream of portfolio value updates.

    Yields:
        SSE-formatted messages with portfolio value data
    """
    global portfolio_value_queue

    # Send initial portfolio value immediately
    try:
        initial_value = calculate_portfolio_value(db)
        data = {
            "total_value": initial_value,
            "timestamp": asyncio.get_event_loop().time()
        }
        yield f"data: {json.dumps(data)}\n\n"
        logger.info(f"SSE client connected, sent initial value: ${initial_value:,.2f}")
    except Exception as e:
        logger.error(f"Error calculating initial portfolio value: {e}")
        yield f"data: {json.dumps({'error': 'Failed to calculate portfolio value'})}\n\n"
        return

    # Keep connection alive and send updates
    try:
        while True:
            try:
                # Wait for update with timeout (heartbeat every 30 seconds)
                update = await asyncio.wait_for(
                    portfolio_value_queue.get(),
                    timeout=30.0
                )
                yield f"data: {json.dumps(update)}\n\n"
                logger.debug(f"Sent portfolio update: ${update['total_value']:,.2f}")
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                yield ": heartbeat\n\n"
            except Exception as e:
                logger.error(f"Error in portfolio stream: {e}")
                break
    finally:
        logger.info("SSE client disconnected")


@router.get("/portfolio-value/stream")
async def stream_portfolio_value(db: Session = Depends(get_db)):
    """
    SSE endpoint for streaming portfolio value updates.

    Returns:
        StreamingResponse with text/event-stream content type
    """
    initialize_portfolio_queue()

    return StreamingResponse(
        portfolio_value_stream(db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/portfolio-value")
async def get_portfolio_value(db: Session = Depends(get_db)):
    """
    Get current portfolio value (non-streaming endpoint for testing).

    Returns:
        JSON with total portfolio value
    """
    try:
        total_value = calculate_portfolio_value(db)
        return {
            "total_value": total_value,
            "timestamp": asyncio.get_event_loop().time()
        }
    except Exception as e:
        logger.error(f"Error calculating portfolio value: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate portfolio value")
