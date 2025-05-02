<?php
// Copyright (C) 2022,2024 Mike Roetto <mike@roetto.org>
// SPDX-License-Identifier: GPL-3.0-or-later

header('Content-Type: application/json');

$dir = 'sqlite:portfolio.sqlite';

$dbh = new PDO($dir) or die("cannot open the database");

if ($_GET['q'] == "weightcomp") {
    $isym = $_GET['symbol'];
    // Get days parameter with default of 365 if not supplied
    $days = isset($_GET['days']) ? intval($_GET['days']) : 365;
    
    if ($isym == "BRKB") {
        $isym = "BRK.B";
    }
    
    $query = "select security_values.timestamp,((close*shares)/value) as wgt ,
        (select weight from weights where symbol = '$isym' and weights.timestamp = security_values.timestamp) as tgt
        from security_values,historical
        where symbol = '$isym' and tgt > 0
        AND security_values.timestamp > date('now','-$days days')
        and security_values.timestamp = historical.date
        order by security_values.timestamp";
        
    foreach ($dbh->query($query) as $row) {
        $array[] = array('weight' => $row['wgt'], 'target' => $row['tgt'], 'date' => $row['timestamp']);
    }
}

if ($_GET['q'] == "cumshares") {
    $isym = $_GET['symbol'];
    if ($isym == "BRKB") {
        $isym = "BRK.B";
    }

    //     
    $query = "select date_new,symbol,units,xtype 
    from transactions 
    where symbol = '$isym' AND (xtype = 'Buy' OR xtype = 'Sell')";

    foreach ($dbh->query($query) as $row) {
        $xtype = $row[xtype];
        if ($xtype == 'Sell') {
            $cumshares = ($cumshares - $row[units]);
        } else {
            $cumshares = ($cumshares + $row[units]);
        }
        $array[] = array('cumshares' => "$cumshares", 'date' => $row[date_new]);
    }
    $cd = date("Y-m-d");
    //         $tomorrow  = mktime(0, 0, 0, date("Y")  , date("m"), date("d")+1);
    $array[] = array('cumshares' => "$cumshares", 'date' => $cd);
}

if ($_GET['q'] == "cumshares2") {
    $isym = $_GET['symbol'];
    if ($isym == "BRKB") {
        $isym = "BRK.B";
    }

    $query = "select timestamp,shares from security_values where symbol = '$isym' 
    AND  timestamp > date('now','-24 months') order by timestamp";

    #echo "date,symbol,shares\n";
    foreach ($dbh->query($query) as $row) {
        $array[] = array('cumshares' => "$row[shares]", 'date' => "$row[timestamp]");
    }
}

if ($_GET['q'] == "cumvalue") {
    $isym = $_GET['symbol'];

    $query = "select date_new,symbol,units,xtype 
    from transactions 
    where symbol = '$isym' AND (xtype = 'Buy' OR xtype = 'Sell')";
    #echo "date,symbol,shares\n";
    foreach ($dbh->query($query) as $row) {
        $xtype = $row[xtype];
        if ($xtype == 'Sell') {
            $cumshares = ($cumshares - $row[units]);
        } else {
            $cumshares = ($cumshares + $row[units]);
        }
        $array[] = array('cumshares' => "$cumshares", 'date' => $row[date_new]);
    }
    $cd = date("Y-m-d");
    //         $tomorrow  = mktime(0, 0, 0, date("Y")  , date("m"), date("d")+1);
    $array[] = array('cumshares' => "$cumshares", 'date' => $cd);
}


if ($_GET['q'] == "posvalues") {
    //     echo $_GET[symbol];

    $isym = $_GET['symbol'];
    if ($isym == "BRKB") {
        $isym = "BRK.B";
    }
    $query = "select timestamp,(close*shares) as pval from security_values where symbol = '$isym' AND  timestamp > date('now','-1080 days') order by timestamp";
    //     echo $query;
    foreach ($dbh->query($query) as $row) {
        //         echo "$row[pval]\n";
        $array[] = array('posvalue' => "$row[pval]", 'date' => $row['timestamp']);
    }
}

if ($_GET['q'] == "secprices") {
    //     echo $_GET[symbol];

    $isym = $_GET['symbol'];
    if ($isym == "BRKB") {
        $isym = "BRK.B";
    }
    $query = "select timestamp,close from security_values where symbol = '$isym' AND  timestamp > date('now','-365  days') order by timestamp";
    //     echo $query;
    foreach ($dbh->query($query) as $row) {
        //         echo "$row[pval]\n";
        $array[] = array('posvalue' => "$row[close]", 'date' => $row['timestamp']);
    }
}



if ($_GET['q'] == "gl") {

    #$query = "SELECT DISTINCT symbol FROM transactions order by symbol";
    $query = "SELECT DISTINCT symbol FROM prices where class IS NOT NULL order by symbol";
    foreach ($dbh->query($query) as $row) {
        $sym = $row['symbol'];

        $subquery = "select sum(units) as buyunits from transactions where xtype = 'Buy' and symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $buyunits = $zrow['buyunits'];

        $subquery = "select sum(units) as sellunits from transactions where xtype = 'Sell' and symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $sellunits = $zrow['sellunits'];

        $subquery = "select price from prices where symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $cprice = $zrow['price'];

        $netunits = ($buyunits - $sellunits);
        if ($netunits == 0)
            continue;

        $subquery = "SELECT sum(units*price) AS buytotal FROM transactions WHERE xtype = 'Buy' AND symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $buytotal = round($zrow['buytotal'], 3);

        $subquery = "SELECT sum(units*price) AS selltotal FROM transactions WHERE xtype = 'Sell' AND symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $selltotal = round($zrow['selltotal'], 3);

        $subquery = "SELECT sum(gain) as rgain FROM transactions WHERE xtype = 'Sell' AND symbol = '$sym'";
        $stmt = $dbh->prepare($subquery);
        $stmt->execute();
        $zrow = $stmt->fetch();
        $gain = round($zrow['rgain'], 3);

        $posvalue = round(($netunits * $cprice), 3);
        $netcost = round(($buytotal - $selltotal), 3);
        $dollarreturn = round(($posvalue - $netcost), 3);

        $array[] = array('symbol' => "$row[symbol]", 'dollarreturn' => "$dollarreturn");
        uasort($array, function ($a, $b) {
            return $a['dollarreturn'] - $b['dollarreturn'];
        });

    }
}

//returns 2 years of dividends
if (!empty($_GET['symquery'])) {
    $symbol = $_GET['symquery'];

    $symbolsToCheck = ['ANGL', 'ASML','FPE','GILD','KMB','LKOR','MLN', 'REM','VMC'];
    $period = in_array($symbol, $symbolsToCheck) ? 36 : 24;

    $query = "select substr(date_new,0,8) as month,symbol,sum(price*units) as cost 
    from transactions 
    where symbol = '$symbol' 
    AND date_new >= Date('now', '-$period months')
    and xtype = 'Div' group by month order by date_new ";
    foreach ($dbh->query($query) as $row) {
        $array[] = array(
            'date' => "$row[month]",
            'symbol' => "$row[symbol]",
            'cost' => "$row[cost]"
        );
    }
}


if ($_GET['verb'] == "sectorpct") {

    $tf = 90;
    if (!empty($_GET['tf'])) {
        $tf = $_GET['tf'];
    }
    $query = "
    select timestamp,historical.value,
  	sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Consumer Discretionary')) as cdisc,
    
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Commodities')) as comd,

        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Healthcare')) as healthcare,

        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Industrials')) as industrials,   
        
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Materials')) as materials,
        
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Precious Metals')) as pm,
        
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Consumer Staples')) as cstaples,
    
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Energy')) as energy,
    
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Financials')) as financials,
        
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Utilities')) as utilities,
    
        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Tech')) as tech,

        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Communication Services')) as commsvc,

        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Bonds')) as bonds,

        sum(close*shares/historical.value*100) 
        filter (where \"symbol\" IN (select symbol from sectors where sector = 'Real Estate')) as re
    
	from security_values,historical
    
    where security_values.timestamp > DATE('now','-$tf day') and security_values.timestamp <= DATE('now')
    and security_values.timestamp = historical.date

    group by timestamp
    order by timestamp 
    
    ";
    foreach ($dbh->query($query) as $row) {
        $array[] = array(
            'date' => "$row[timestamp]",
            'materials' => "$row[materials]",
            'financials' => "$row[financials]",
            'comd' => "$row[comd]",
            'healthcare' => "$row[healthcare]",
            'industrials' => "$row[industrials]",
            'tech' => "$row[tech]",
            'energy' => "$row[energy]",
            'utilities' => "$row[utilities]",
            'pm' => "$row[pm]",
            're' => "$row[re]",
            'cdisc' => "$row[cdisc]",
            'cstaples' => "$row[cstaples]",
            'commsvc' => "$row[commsvc]",
            'bonds' => "$row[bonds]"
        );
    }
}

// where security_values.timestamp > DATE('now','-$tf day') and security_values.timestamp <= DATE('now','-1 day')

if ($_SERVER['QUERY_STRING'] == "catpct") {
    $tf = 370;
    $query = "select timestamp,(sum(shares*close)/value)*100 as pct
    from security_values,historical 
    where symbol IN 
    (select symbol from prices where asset_class = 'Commodities')
    and security_values.timestamp = historical.date
    and timestamp > date('now','-$tf days')
    group by timestamp order by timestamp ";

    foreach ($dbh->query($query) as $row) {
        $ix++;
        $array[] = array('date' => "$row[timestamp]", 'pctcomms' => "$row[pct]");

    }

    $ix = 0;

    $query = "select timestamp,(sum(shares*close)/value)*100 as pct
    from security_values,historical 
    where symbol IN 
    (select symbol from prices where asset_class LIKE '%Stock')
    and security_values.timestamp = historical.date
    and timestamp > date('now','-$tf days')
    group by timestamp order by timestamp";

    foreach ($dbh->query($query) as $row) {
        $array[$ix]["pctstock"] = "$row[pct]";
        $ix++;
    }

    $ix = 0;

    $query = "select timestamp,(sum(shares*close)/value)*100 as pct
    from security_values,historical 
    where symbol IN 
    (select symbol from prices where asset_class LIKE '%Bonds')
    and security_values.timestamp = historical.date
    and timestamp > date('now','-$tf days')
    group by timestamp order by timestamp";

    foreach ($dbh->query($query) as $row) {
        $array[$ix]["pctbonds"] = "$row[pct]";
        $ix++;
    }


    $ix = 0;

    $query = "select timestamp,(sum(shares*close)/value)*100 as pct
    from security_values,historical 
    where symbol IN 
    (select symbol from prices where symbol IN ('SGOL','XAG','SIVR')
    and security_values.timestamp = historical.date)
    and timestamp > date('now','-$tf days')
    group by timestamp order by timestamp";

    foreach ($dbh->query($query) as $row) {
        $array[$ix]["pctpm"] = "$row[pct]";
        $ix++;
    }


    $ix = 0;

    $query = "select timestamp,(sum(shares*close)/value)*100 as pct
    from security_values,historical 
    where symbol IN 
    (select symbol from prices where asset_class = 'Real Estate')
    and security_values.timestamp = historical.date
    and timestamp > date('now','-$tf days')
    group by timestamp order by timestamp";

    foreach ($dbh->query($query) as $row) {
        $array[$ix]["pctRE"] = "$row[pct]";
        $ix++;
    }

}


if (!empty($_GET['symreturn'])) {
    $symbol = $_GET['symreturn'];

    if (!empty($_GET['tf'])) {
        $days = $_GET['tf'];
    } else {
        $days = 365;
    }


    //     echo "symquery for $symbol\n";
    $query = "SELECT timestamp,symbol,cost_basis,
    close*shares as value,close,cbps,
    ((((close*shares)+cum_divs+cum_real_gl)-cost_basis ) / cost_basis)*100 as rtn
    FROM security_values WHERE symbol = '$symbol' AND timestamp > date('now','-$days  days') ORDER BY timestamp ";

    foreach ($dbh->query($query) as $row) {
        $array[] = array(
            'date' => "$row[timestamp]",
            'symbol' => "$row[symbol]",
            'cost' => "$row[cost_basis]",
            'value' => "$row[value]",
            'close' => "$row[close]",
            'cbps' => "$row[cbps]",
            'rtn' => "$row[rtn]"
        );
    }
}





echo json_encode($array);
//  print_r($array);
?>
