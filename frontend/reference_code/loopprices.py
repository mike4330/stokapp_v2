#!/usr/bin/python3
# Copyright (C) 2022,2024 Mike Roetto <mike@roetto.org>
# SPDX-License-Identifier: GPL-3.0-or-later
import sqlite3
import syslog
import yfinance as yf
import datetime
import time
import requests_cache
from random import randint
from time import sleep
from random import shuffle
import random

session = requests_cache.CachedSession("yfinance.cache", expire_after=45)
now = datetime.datetime.now()
print(now.year, now.month, now.day, now.hour, now.minute, now.second)
# 2015 5 6 8 53 40

elapsed = 0

if now.hour > 16:
    print("outside of time window current time is ", now.hour, now.minute)
    exit()

con = sqlite3.connect("/var/www/html/portfolio/portfolio.sqlite")
cur = con.cursor()


with open("/var/www/html/portfolio/tickersloop.txt", "r") as f:
    tickers = [line.strip() for line in f if not line.startswith("#")]

#tickers=random.shuffle(tickers)
random.shuffle(tickers)


hour = now.hour
while hour < 16:
    starttime = time.time()

    msg = "[stockprice] starting cycle"

    syslog.syslog(msg)

    for ticker in tickers:
        stock = yf.Ticker(ticker, session=session)
        if now.hour > 10 and ticker in ['FNBGX','FAGIX','FDGFX']:
            continue

        try:
            price = stock.fast_info["last_price"]
            price = round(price,8)
        except:
            print("data download fail for ", ticker)
            continue

        if price == None:
            print("bad data for ", ticker, " cont")
            continue

        ts = time.time()
        print(ts, ticker, price)
        msg = "[stockprice] update  " + ticker + ' ' + str(price)
        syslog.syslog(msg)

        if ticker == "BRK-B":
            ticker = "BRK.B"

        try:
            cur.execute(
                "update prices set price = ?, lastupdate = ? where symbol = ?",
                (price, ts, ticker),
            )
            con.commit()
            
        except:
            print("temp fail")

        elapsed = round((ts - starttime), 1)
        waitint=(randint(1,6500)/1000)
        sleep(waitint)

    print("elapsed cycle time ", elapsed)

    msg = "[stockprice] finished cycle. elapsed time: " + str(elapsed)

    syslog.syslog(msg)

    cyclewait=randint(15,45)
    time.sleep(cyclewait)
    now = datetime.datetime.now()
    hour = now.hour


