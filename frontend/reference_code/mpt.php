<!--Copyright (C) 2022,2024 Mike Roetto <mike@roetto.org>
SPDX-License-Identifier: GPL-3.0-or-later-->
<!DOCTYPE html>

<html>

<?php include ("nav.php"); ?>
<?php include ("functions.php"); ?>
<head>

  <style>
   @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Display:ital,wght@0,100..900;1,100..900&family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap');
  </style>
    <link rel="stylesheet" type="text/css" href="test.css">
    <link rel="stylesheet" type="text/css" href="nav.css">
  <title>MPT Modeling</title>
  <script src="/js/jquery-3.1.1.min.js"></script>
  <script type="text/javascript" src="/js/chart.js"></script>
  <script>
    function numericsort(n) {
      var table, rows, switching, i, x, y, shouldSwitch;
      table = document.getElementById("myTable2");
      switching = true;
      /*Make a loop that will continue until
      no switching has been done:*/
      while (switching) {
        //start by saying: no switching is done:
        switching = false;
        rows = table.rows;
        /*Loop through all table rows (except the
        first, which contains table headers):*/
        for (i = 1; i < (rows.length - 1); i++) {
          //start by saying there should be no switching:
          shouldSwitch = false;
          /*Get the two elements you want to compare,
          one from current row and one from the next:*/
          x = rows[i].getElementsByTagName("TD")[n];
          y = rows[i + 1].getElementsByTagName("TD")[n];
          //check if the two rows should switch place:
          if (Number(x.innerHTML) > Number(y.innerHTML)) {
            //if so, mark as a switch and break the loop:
            shouldSwitch = true;
            break;
          }
        }
        if (shouldSwitch) {
          /*If a switch has been marked, make the switch
          and mark that a switch has been done:*/
          rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
          switching = true;
        }
      }
    }

    function sortTable(n) {
      var table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
      table = document.getElementById("myTable2");
      switching = true;
      // Set the sorting direction to ascending:
      dir = "asc";
      /* Make a loop that will continue until
      no switching has been done: */
      while (switching) {
        // Start by saying: no switching is done:
        switching = false;
        rows = table.rows;
        /* Loop through all table rows (except the
        first, which contains table headers): */
        for (i = 1; i < (rows.length - 1); i++) {
          // Start by saying there should be no switching:
          shouldSwitch = false;
          /* Get the two elements you want to compare,
          one from current row and one from the next: */
          x = rows[i].getElementsByTagName("TD")[n];
          y = rows[i + 1].getElementsByTagName("TD")[n];
          /* Check if the two rows should switch place,
          based on the direction, asc or desc: */
          if (dir == "asc") {
            if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
              // If so, mark as a switch and break the loop:
              shouldSwitch = true;
              break;
            }
          } else if (dir == "desc") {
            if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
              // If so, mark as a switch and break the loop:
              shouldSwitch = true;
              break;
            }
          }
        }
        if (shouldSwitch) {
          /* If a switch has been marked, make the switch
          and mark that a switch has been done: */
          rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
          switching = true;
          // Each time a switch is done, increase this count by 1:
          switchcount++;
        } else {
          /* If no switching has been done AND the direction is "asc",
          set the direction to "desc" and run the while loop again. */
          if (switchcount == 0 && dir == "asc") {
            dir = "desc";
            switching = true;
          }
        }
      }
    }

    function startTime() {
      const today = new Date();
      let h = today.getHours();
      let m = today.getMinutes();
      let s = today.getSeconds();
      h = checkTime(h);
      m = checkTime(m);
      s = checkTime(s);
      document.getElementById('txt').innerHTML = h + ":" + m + ":" + s;
      setTimeout(startTime, 1000);
    }

    function checkTime(i) {
      if (i < 10) {
        i = "0" + i
      }; // add zero in front of numbers < 10
      return i;
    }
  </script>


  </script>
</head>

<body onload="startTime()">
  <div id="txt" class="clock"></div>
  <div class="clock2">00:88:88</div>
  <?php

  $iconcolor['B'] = "#153315";
  $icontc['B'] = "#f9f9f9";
  $icon['B'] = "📜";
  $iconcolor['CD'] = "#9999ff";
  $icontc['CD'] = "#000000";
  $icon['CD'] = "💍";
  $iconcolor['CM'] = "#ee4400";
  $icontc['CM'] = "#000000";
  $icon['CM'] = "🌽";
  $iconcolor['CO'] = "#404040";
  $icontc['CO'] = "#c9c900";
  $icon['CO'] = "☎";
  $iconcolor['CS'] = "#ecec11";
  $icontc['CS'] = "#000000";
  $icon['CS'] = "🍞";
  $iconcolor['E'] = "#99ee99";
  $icontc['E'] = "#000000";
  $icon['E'] = "🛢️";
  $iconcolor['F'] = "#aaaaaa";
  $icontc['F'] = "#000000";
  $icon['F'] = "💵";
  $iconcolor['H'] = "#880088";
  $icontc['H'] = "#fefefe";
  $icon['H'] = "🏥";
  $iconcolor['ID'] = "#fefefe";
  $icontc['ID'] = "#000000";
  $icon['ID'] = "🏭";
  $iconcolor['IT'] = "#338833";
  $icontc['IT'] = "#000000";
  $icon['IT'] = "💻";
  $iconcolor['M'] = "#333333";
  $icontc['M'] = "#ffcc11";
  $icon['M'] = "⛏";
  $iconcolor['MS'] = "#e9e9e9";
  $icontc['MS'] = "#000000";
  $icon['MS'] = "🎱";
  $iconcolor['RE'] = "#990101";
  $icontc['RE'] = "#fdfdfd";
  $icon['RE'] = "🏡";
  $iconcolor['U'] = "#785600";
  $icontc['U'] = "#ffffff";
  $icon['U'] = "⚡";

  $dir = 'sqlite:portfolio.sqlite';

  $dbh = new PDO($dir) or die("cannot open the database");

  $portfolio_value = get_portfolio_value();

  // echo "portfolio_value = $portfolio_value";
  $query = "SELECT DISTINCT symbol,target_alloc,sector FROM MPT order by symbol";

  echo "<table class=\"mpt\" id=\"myTable2\" >";
  echo "
<tr><th>Symbol</th><th>tWgt</th>
<th>Val</th><th>tVal</th><th onclick=\"numericsort(4)\">tDiff</th><th>Dpct</th><th>class</th><th onclick=\"sortTable(7)\">Sector</th></tr>";

  foreach ($dbh->query($query) as $row) {
    $sym = $row['symbol'];
    $sector = $row['sector'];
    $logo_file = $row['logo_file'];
    $subquery = "select close*shares as pos_val from security_values 
    where symbol = '$sym' 
    order by timestamp desc limit 1";
    $stmt = $dbh->prepare($subquery);
    $stmt->execute();
    $zrow = $stmt->fetch();
    $pos_val = round($zrow['pos_val'], 2);

    $subquery = "select asset_class,compidx2 from prices where symbol = '$sym'";
    $stmt = $dbh->prepare($subquery);
    $stmt->execute();
    $zrow = $stmt->fetch();
    $current_class = $zrow['asset_class'];
    //     $compidx2=round($zrow['compidx2'],1);
  
    $talloc = round($row['target_alloc'], 4);
    $talloc_display = round(($row['target_alloc'] * 100), 2);


    $tvalue = round($talloc * $portfolio_value, 2);
    // echo "symbol $sym tvalue $tvalue<br>";
  
    if ($tvalue == 0) {
      continue;
    }

    $pos_val=posvalue($sym);
    
    $tdiff = round(($pos_val - $tvalue), 2);

    if ($tdiff < -1) {
      $color2 = "#cc0000";
      $tcolor2 = "white";
      $subquery = "update MPT set flag = 'U' where symbol = '$sym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
    } elseif ($returnpct > -5 && $returnpct < 0) {
      $color2 = "$red1";
    } else {
      $color2 = "";
      $tcolor2 = "";
    }

    if ($tdiff > -1 && $tdiff < 0) {
      $subquery = "update MPT set flag = 'H' where symbol = '$sym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
    }

    if ($tdiff > -1) {
      $subquery = "update MPT set flag = 'O' where symbol = '$sym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
    }

    $class_total[$current_class] = $class_total[$current_class] + $pos_val;
    $class_proposed_total[$current_class] = $class_proposed_total[$current_class] + $tvalue;

    $diffamt[$sym] = $tdiff;

    $diffpct = round(100 * ($tdiff / $tvalue), 2);

    $uquery = "update MPT set overamt = $diffamt[$sym] where symbol = '$sym'";
    $stmt = $dbh->prepare($uquery);
    $stmt->execute();

    if ($diffpct > 100) {
      $pbg = "#00ff00";
    } else {
      $pbg = "#ffffff";
    }

    echo "<tr class=\"main\">
    
    <td><a href=\"/portfolio/?symfilter=$sym\" class=\"symclick\">$sym</a></td><td>$talloc_display %</td>
    <td>\$$pos_val</td><td>\$$tvalue</td>
    <td style=\"background: $color2;color: $tcolor2\">$tdiff</td><td style=\"background: $pbg;\">$diffpct %</td>
    <td>$current_class</td><td>$sector</td></tr>";
  }

  echo "</table>";


  // picker table
  echo "\n\n<table class=\"picker\">
<tr><th colspan=8>Picker</th></tr>
  <tr><th>sc</th><th>symbol</th>
  
  <th>Diff</th>
  <th>ζ val</th>
  <th>chg</th><th>off200</th><th>52range</th><th>RSSI</th><th>PE diff</th></tr>";

  // chooser algorithm
  
  // $query = "select sectorshort,prices.symbol,hlr,overamt,volat,RSI,round((pe-average_pe),2) as diff,
  // (RSI/100)+volat+((price-mean50)/price)+((price-mean200)/price)-(prices.divyield/2)- (div_growth_rate/3) as z
  // from prices,MPT,sectors
  // where prices.symbol = MPT.symbol
  // and prices.symbol = sectors.symbol
  // and overamt < -5.6 
  // order by z limit 15";
  
  $overweight_min_thresh = -7.0;

  $query = "select sectorshort,prices.symbol,hlr,overamt,volat,RSI,round((pe-average_pe),2) as diff,
  (coalesce((pe-average_pe),0)/9)+(RSI/100)+volat+((price-mean50)/price)+((price-mean200)/price)-(prices.divyield/2) - (div_growth_rate/3) - (fcf_ni_ratio/2) as z
  from prices,MPT,sectors
  where prices.symbol = MPT.symbol
  and prices.symbol = sectors.symbol
  and overamt < $overweight_min_thresh 
  order by z limit 15";

  foreach ($dbh->query($query) as $trow) {
    
    $symbol = $trow['symbol'];
    $sectorshort = $trow['sectorshort'];

    $subquery = "select MPT.symbol,
      (prices.price-mean200)/prices.price as avg200diff,
      prices.price-(select close from security_values where symbol = MPT.symbol order by timestamp desc limit 1) as pricediff 
    from MPT,prices 
    where flag = 'U' and MPT.symbol = '$symbol'
    and MPT.symbol = prices.symbol";

    $stmt = $dbh->prepare($subquery);
    $stmt->execute();
    $zrow = $stmt->fetch();
    $pricediff = round($zrow['pricediff'], 2);
    $diff200 = round($zrow['avg200diff'] * 100, 1);

    if ($pricediff < 0) {
      $bgstring = "#03aa03";
      $clrstring = "#000000";
    } else {
      $bgstring = "#000000";
      $clrstring = "#88dd88";
    }

    if ($diffamt[$symbol] < 0 and $diffamt[$symbol] > -3) {
      continue;
    }

    $range = round($trow['hlr'], 2);
    $zeta = round(($trow['z'] * 1000), 0);
    $netunits = posvalue($symbol);

    echo "<tr>
  <td style=\"background: $iconcolor[$sectorshort];\"><span style=\"background: $iconcolor[$sectorshort];color: $icontc[$sectorshort];\" class=\"sectoricon\">$trow[sectorshort] <span style=\"filter: drop-shadow(2px 2px 2px #110000);\">$icon[$sectorshort]</span></span></td>
  <td><a href=\"/portfolio/?symfilter=$trow[symbol]\" class=\"symclick\">$trow[symbol]</a></td>

  <td style=\"background: $bgstring;color: $clrstring;\">$diffamt[$symbol]</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$zeta</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$pricediff</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$diff200%</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$range</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$trow[RSI]</td>
  <td style=\"background: $bgstring;color: $clrstring;\">$trow[diff]</td>
  
  </tr>\n";
  }

  echo "</table>\n";


  //overs sell table
  echo "<table class=\"overs\"><th>sym</th><th colspan=2>Over Amt.</th><th>pr.chg.</th>";
  $query = "select symbol from MPT where flag = 'O'";
  foreach ($dbh->query($query) as $trow) {
    $sym = $trow['symbol'];

    $subquery = "select price,
      (select close from security_values where symbol = '$sym' order by timestamp desc limit 1) as pprice
      from prices where symbol = '$sym'";
    $stmt = $dbh->prepare($subquery);
    $stmt->execute();
    $zrow = $stmt->fetch();

    if ($diffamt[$sym] < 10) {
      continue;
    }

    $pricediff = round(($zrow['price'] - $zrow['pprice']), 2);

    if ($pricediff > 0) {
      $bgstring = "#03aa03";
      $clrstring = "#000000";
    } else {
      $bgstring = "#000000";
      $clrstring = "#99ee99";
    }

    $barwidth = $diffamt[$sym] * .03 . "vw";
    $gradwidth = 0;
    echo "<tr>
    <td style=\"background: $bgstring;color: $clrstring;\">$sym</td>
    <td style=\"background: $bgstring;color: $clrstring;\">$diffamt[$sym]</td>
    <td><svg class=\"bars\" width=\"$barwidth\" height=\"1vw\">";

    echo '  <linearGradient id="myGradient" >
      <stop offset="1%"  stop-color="#004c00" />';
    echo "<stop offset=\"95%\" stop-color=\"#22ff22\" />
    </linearGradient>";

    echo "<rect x=\"0\" y=\"0\" width=\"$barwidth\" height=\"1vw\" rx=\"4\" style=\"fill:url(\#myGradient);\"/>
		</svg></td>
    <td style=\"background: $bgstring;color: $clrstring;\">$pricediff</td></tr>";
  }
  echo "</table>";

  function get_portfolio_value()
  {
    //     echo "executing function<br>";
    $dir = 'sqlite:portfolio.sqlite';
    $dbh = new PDO($dir) or die("cannot open the database");
    $q = "SELECT DISTINCT symbol FROM transactions order by symbol";
    foreach ($dbh->query($q) as $trow) {
      $tsym = $trow['symbol'];
      $subquery = "select sum(units) as buyunits from transactions where xtype = 'Buy' and symbol = '$tsym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
      $zrow = $stmt->fetch();
      $buyunits = $zrow['buyunits'];
      $subquery = "select sum(units) as sellunits from transactions where xtype = 'Sell' and symbol = '$tsym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
      $zrow = $stmt->fetch();
      $sellunits = $zrow['sellunits'];
      $netunits = ($buyunits - $sellunits);
      $subquery = "select price from prices where symbol = '$tsym'";
      $stmt = $dbh->prepare($subquery);
      $stmt->execute();
      $zrow = $stmt->fetch();
      $cprice = $zrow['price'];

      if ($netunits == 0)
        continue;

      $value = round(($netunits * $cprice), 3);
      $ttotal = ($ttotal + $value);
      //      echo "total $ttotal <br>";
    }
    return $ttotal;
  }


  ?>
