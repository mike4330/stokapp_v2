<!--Copyright (C) 2022 Mike Roetto <mike@roetto.org>
SPDX-License-Identifier: GPL-3.0-or-later-->
<!DOCTYPE html>
<html>
<?php include("nav.php"); ?>
<?php include("functions.php"); ?>

<head>
  <meta http-equiv="refresh" content="300">
  <link rel="stylesheet" type="text/css" href="main.css">
  <link rel="stylesheet" type="text/css" href="nav.css">
  <title>Tax Lot Analysis</title>
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
  </script>

</head>

<body>

  <div class="filter-controls">
  <span style="background: white;width: 100%;font-family: font3;">Lot Basis</span><br>
    <button id="decrease">⬇</button>
    <input type="number" id="threshold" value="5" length="5">
    <button id="increase">⬆</button>
    <br>
    <span style="background: white;width: 100%;font-family: font3;">Return PCT</span><br>
    <button id="returnincrease">+</button>
    <input type="number" id="returnpct" value="5" length="2">
    <button id="returndecrease">-</button>
  </div>



  <table class="lots">
    <th>Account</th>
    <th>symbol</th>
    <th>date</th>
    <th>units</th>

    <th>CPrice</th>
    <th>cur val</th>
    <th>profit</th>
    <th>pct</th>
    <?php


    // tuning params
    $profit_low_thresh = 0.6;
    $lot_low_thresh = 1;
    $overweight_min_thresh = 8.6;

    $hcolor[0] = "#ffffff";
    $hcolor[1] = "#009900";
    $hcolor[2] = "#00cc00";
    $hcolor[3] = "#00ff00";
    $hcolor[4] = "#22ff22";

    $dir = 'sqlite:portfolio.sqlite';
    // include("nav.php");
    $dbh = new PDO($dir) or die("cannot open the database");

    $query = "SELECT  symbol,flag,overamt 
      FROM MPT where flag = 'O' and overamt > $overweight_min_thresh
      order by overamt DESC";
    foreach ($dbh->query($query) as $row) {
      $symbol = $row['symbol'];
      $flag = $row['flag'];
      $result = calculateTargetDiff($symbol);
      $target_diff = $result['target_diff'];

	if ($target_diff < $overweight_min_thresh) {continue;}

      $pquery = "select price from prices where symbol = '$symbol'";
      $stmt = $dbh->prepare($pquery);
      $stmt->execute();
      $zrow = $stmt->fetch();
      $cprice = round($zrow['price'], 4);

      echo "<tr><td colspan=9 style=\"background: black;\"></td></tr>";

      $subquery = "select * from transactions 
    where symbol = '$symbol' and xtype='Buy' and disposition IS NULL ";

      foreach ($dbh->query($subquery) as $rowb) {
        if ($rowb['price'] == 0) {
          continue;
        }
        if ($rowb['price'] < $cprice) {
          if ($rowb['units_remaining']) {
            $units = $rowb['units_remaining'];
          } else {
            $units = $rowb['units'];
          }
          $curval = round(($cprice * $units), 2);
          $cost = $rowb['price'] * $units;
          $profit = round(($curval - $cost), 2);
          $profit_pct = round(($profit / $cost), 3) * 100;

          $pclr = "";
          $ptxt = "";
          $fs = 100;

          #matplotlib 'viridis'
          $hmcolors = array(
            '#fde725',
            '#d8e219',
            '#addc30',
            '#84d44b',
            '#5ec962',
            '#3fbc73',
            '#28ae80',
            '#1fa088',
            '#21918c',
            '#26828e',
            '#2c728e',
            '#33638d',
            '#3b528b',
            '#424086',
            '#472d7b',
            '#48186a',
            '#440154',
            '#3f0446',
            '#390039',
            '#2e002c',
            '#25001f',
            '#1b0015'
        );

          switch ($profit_pct) {
            
            case $profit_pct > 116.5:
              $pclr = $hmcolors[12];
              $fs = 126;
              continue;
            case $profit_pct > 89.6:
              $pclr = $hmcolors[11];
              $fs = 126;
              continue;
            case $profit_pct > 68.9:
              $pclr = $hmcolors[10];
              $fs = 126;
              continue;
            case $profit_pct > 53:
              $pclr = $hmcolors[9];
              $fs = 120;
              continue;
            case $profit_pct > 40.8:
              $pclr = $hmcolors[8];
              $fs = 118;
              continue;
            case $profit_pct > 31.4:
              $pclr = $hmcolors[7];
              $fs = 116;
              $ptxt = "black";
              continue;
            case $profit_pct > 24.1:
              $pclr = $hmcolors[6];
              $fs = 114;
              $ptxt = "black";
              continue;
            case $profit_pct > 18.6:
              $pclr = $hmcolors[5];
              $fs = 112;
              $ptxt = "black";
              continue;
            case $profit_pct > 14.3:
              $pclr = $hmcolors[4];
              $ptxt = "black";
              $fs = 110;
              continue;
            case $profit_pct > 11:
              $pclr = $hmcolors[3];
              $ptxt = "black";
              $fs = 108;
              continue;
            case $profit_pct > 8.5:
              $pclr = $hmcolors[2];
              $ptxt = "black";
              $fs = 106;
              continue;
            case $profit_pct > 6.5:
              $pclr = $hmcolors[1];
              $ptxt = "black";
              $fs = 104;
              continue;
            case $profit_pct > 5:
              $pclr = $hmcolors[0];
              $ptxt = "black";
              $fs = 102;
              continue;
          }

          #discard trash
          if ($profit < $profit_low_thresh) {
            continue;
          }
          if ($curval < $lot_low_thresh) {
            continue;
          }

          if ((strtotime('now') - strtotime($rowb['date_new'])) / (60 * 60 * 24) > 365) {
            $lsymbol = "✔";
          } else {
            $lsymbol = " ";
          }


          echo "\n<tr><td class=lots>$rowb[acct]</td><td class=lots>$symbol</td>
              <td class=lots>$lsymbol $rowb[date_new]</td>
              <td class=lots>$units</td>
              <td class=lots>$cprice</td>
              <td class=lots_b data-value='$curval'>$curval</td>
              <td class=lots><b>$profit</b></td>
	            <td class=lots_c style=\"background: $pclr;\"><span style=\"font-size: $fs%;color: $ptxt\">$profit_pct%</span></td>
              </tr>";
          // $sum[$symbol] = $sum[$symbol] + $profit;
          $sum[$symbol] += $profit;
        }
      }
      if ($sum[$symbol]) {
        if ($sum[$symbol] > 6.86) {
          $ci = 4;
        } elseif ($sum[$symbol] > 3.61) {
          $ci = 3;
        } elseif ($sum[$symbol] > 1.9) {
          $ci = 2;
        } elseif ($sum[$symbol] > 1) {
          $ci = 1;
        } else {
          $ci = 0;
        }
        echo "<tr><td colspan=3 style=\"color: #a0a0a0;font-size: .85vw;\">profit for $symbol
       <b><span style=\"font-size: .85vw;background: $hcolor[$ci];color:#000000; padding-left: 2px; padding-right: 2px;\">\$$sum[$symbol]</b></span></td></tr>";
        $totalprofit = $totalprofit + $sum[$symbol];

        // echo "<tr><td colspan=3 style=\"font-size: .86vw;\">Total over weight \$$row[overamt]</td></tr>";
        echo "<tr><td colspan=3 style=\"font-size: .86vw;\">Total over weight \$$target_diff</td></tr>";
      }
    }
    echo "<tr><td colspan=3>total avail profit $totalprofit</td></tr>";
    ?>
  </table>
  <script>
    const thresholdInput = document.getElementById('threshold');
    const decreaseButton = document.getElementById('decrease');
    const increaseButton = document.getElementById('increase');

    const returnpctInput = document.getElementById('returnpct');
    const returnincreaseButton = document.getElementById('returnincrease');
    const returndecreaseButton = document.getElementById('returndecrease');

    let threshold = parseInt(thresholdInput.value);
    let returnpct = parseFloat(returnpctInput.value);
    const element = document.querySelector('.lots_b');

    if (element) {
      // Element found
      console.log('Element with class "lots" found!', element);
      const value = parseFloat(element.dataset.value);
      console.log('value', value)
    } else {
      // No element found
      console.log('No element with class "lots" found.');
    }

    function filterTable() {
      const rows = document.querySelectorAll('table tr');
      rows.forEach(row => {
        const valueCell = row.querySelector('.lots_b');
        const pctCell = row.querySelector('.lots_c span');

        if (valueCell && pctCell) {
          const value = parseFloat(valueCell.dataset.value);
          const pct = parseFloat(pctCell.textContent);

          if (!isNaN(value) && !isNaN(pct)) {
            const showRow = value >= threshold && pct >= returnpct;
            row.style.display = showRow ? 'table-row' : 'none';
          }
        }
      });
    }

  </script>
  <script>


    // const thresholdInput = document.getElementById('threshold');
    // const decreaseButton = document.getElementById('decrease');
    // const increaseButton = document.getElementById('increase');

    // const returnpctInput = document.getElementById('returnpct');
    // const returnincreaseButton = document.getElementById('returnincrease');
    // const returndecreaseButton = document.getElementById('returndecrease');

    // let threshold = parseInt(thresholdInput.value);

    function updateThreshold(value) {
      threshold += value;
      thresholdInput.value = threshold;
      filterTable();
    }
    decreaseButton.addEventListener('click', () => updateThreshold(-1));
    increaseButton.addEventListener('click', () => updateThreshold(1));

    function updateReturnPct(value) {
      returnpct += value;
      returnpctInput.value = returnpct.toFixed(1);
      filterTable();
    }

    returndecreaseButton.addEventListener('click', () => updateReturnPct(-0.5));
    returnincreaseButton.addEventListener('click', () => updateReturnPct(0.5));


  </script>


</body>

</html>
