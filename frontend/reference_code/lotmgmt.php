<!-- Copyright (C) 2024 Mike Roetto <mike@roetto.org>
SPDX-License-Identifier: GPL-3.0-or-later -->
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" type="text/css" href="main.css">
    <link rel="stylesheet" type="text/css" href="nav.css">
    <!-- <title>Open Lots</title> -->
    <script src="res/functions.js"></script>
    <style>
        body {
            /* background: #aeaeae; */
        }

        @font-face {
            font-family: vcr;
            src: url(res/VCR_OSD_MONO_1.001.ttf);
        }

        table {
            /* width: 90vw; */
            border-collapse: collapse;
            margin: auto;
        }

        table td {
            background: #cfcfcf;
            font: 1.1vw monospace;
            border: 1px solid #000000;
            color: #000000;
            padding-left: .27vw;
            padding-right: .13vw;
        }

        table th {
            /* border: 1px solid black; */
            background: #323233;
            color: #cfcfcf;
            opacity: .95;
            padding: 8px;
            font: 1.1vw monospace;
            position: sticky;
            top: 3.5vh;
        }

        div.buttons {
            border-radius: 8px;
            background-color: #232323;
            width: 12vw;
            position: fixed;
            top: 33vh;
        }

        div.status {
            position: fixed;
            border-radius: 8px;
            top: 23vh;
            background-color: #000000;
            font: 1.2vw monospace;
            font-family: "vcr";
            color: #0000ff;
            text-shadow: 0 0 10px rgba(0, 0, 255, .9);
            padding: 5px;
        }

        div.maintable {
            position: absolute;
            left: 12vw;
        }


        .button {
            display: inline-block;
            padding: 1px 10px;
            background-color: #2C8F30;
            color: white;
            text-decoration: none;
            font: 1.2vw monospace;
            border-radius: 5px;
            margin: 2px;
        }

        .button:hover {
            background-color: #124512;
        }

        input[type="number"] {
            font-size: 1.1vw;
            width: 4em;

            #number {
                width: 3em;
            }

        }

        td.buttons {
            background: none;
        }
    </style>
</head>

<?php
include ("nav.php");
if (isset($_GET['lb'])) {
    $lb = $_GET['lb'];
    // echo "lb is $lb<br>";
} else {
    // Handle the case when 'lb' parameter is not present
}

if (isset($_GET['lowbasis'])) {
    $lowbasis = $_GET['lowbasis'];
    // echo "lb is $lb<br>";
} else {
}

if (isset($_GET['term'])) {
    $pterm = $_GET['term'];
    // echo "lb is $lb<br>";
} else {
}

if (isset($_GET['plpct'])) {
    $plpct = $_GET['plpct'];
    // echo "lb is $lb<br>";
} else {
}


// Connect to SQLite database
$database = new SQLite3('portfolio.sqlite');
if (!$database) {
    die("Failed to connect to database");
}

// Query to fetch price values for all symbols
$query = "SELECT symbol, price FROM prices";
$result = $database->query($query);

// Initialize the price array
$price = [];

// Fetch price values and store them in the price array
while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
    $symbol = $row['symbol'];
    $cprice[$symbol] = $row['price'];
}

// Close the database connection
$database->close();

// Access the price value for ASML
// echo $price['ASML'];

?>

<body>
    <h1>Open Lots</h1>
    <div class="buttons">
        <table width=100%>
            <th>PL</th>
            <th>LB</th>
            <tr>
                <td align="center" class="buttons" colspan=2> <a href="lotmgmt.php" class="button">ALL</a></td>
            </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=0" class="button">$0</a></td>
        <td class="buttons"><a href="lotmgmt.php?lowbasis=1" class="button">$1</td>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=.5" class="button">$0.50</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=2" class="button">$2</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=1" class="button">$1</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=4" class="button">$4</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=2" class="button">$2</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=8" class="button">$8</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=4" class="button">$4</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=16" class="button">$16</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=8" class="button">$8</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=24" class="button">$24</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=16" class="button">$16</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=36" class="button">$36</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=24" class="button">$24</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=54" class="button">$54</td>
        </tr>
        </tr>
            <tr><td class="buttons"><a href="lotmgmt.php?lb=36" class="button">$36</a></td>
            <td class="buttons"><a href="lotmgmt.php?lowbasis=80" class="button">$80</td>
        </tr>
        <tr><td class="buttons"><a href="lotmgmt.php?term=Short" class="button">Short</td>
        <td class="buttons"><a href="lotmgmt.php?term=Long" class="button">Long</td>
    </tr>
    <tr><th colspan=2>PL</th></tr>
    <tr>
    <td class="buttons"><a href="lotmgmt.php?plpct=5" class="button">5%</td>
    <td class="buttons"><a href="lotmgmt.php?plpct=10" class="button">10%</td>
    </tr>
    <tr>
    <td class="buttons"><a href="lotmgmt.php?plpct=12.5" class="button">12.5%</td>
    <td class="buttons"><a href="lotmgmt.php?plpct=15" class="button">15%</td></tr>
    <tr>
    <td class="buttons"><a href="lotmgmt.php?plpct=17.5" class="button">17.5%</td>
    <td class="buttons"><a href="lotmgmt.php?plpct=20" class="button">20%</td>
    </tr>
    <tr>
    <td class="buttons"><a href="lotmgmt.php?plpct=22.5" class="button">22.5%</td>
    <td class="buttons"><a href="lotmgmt.php?plpct=25" class="button">25%</td>
    </tr>
        </table>
    </div>

    <?php

    $database = new SQLite3('portfolio.sqlite');

 

    // Fetch all open lots
    $query = "SELECT *
    FROM transactions
    WHERE xtype = 'Buy' 
    AND disposition is NOT 'sold' order by symbol asc,date_new ";
    $result = $database->query($query);

    $database = new SQLite3('portfolio.sqlite');
    if (!$database) {
        die("Failed to connect to database");
    }

    if ($result && $result->numColumns() > 0) {
        echo '<div class="maintable"><table id="sortedtable">';
        echo '<tr>';
        echo '<th>acct</th><th>ID</th>';
        echo '<th>Term</th>';
        echo '<th onclick=sortTable(2)>Date</th>';
        echo '<th>Symbol</th>';
        echo '<th>P. Price</th>';
        // echo '<th>C. Price</th>';
        echo '<th>Units </th>';
        echo '<th>Units<br>Rem.</th>';
        echo '<th onclick=numericsort(8)>Lot<br> Basis</th>';
        echo '<th>Cur Val</th>';
        echo '<th onclick=numericsort(10)>PL$</th>';
        echo '<th onclick=numericsort(11)>PL%</th>';
        echo '<th colspan=1></th>';
        echo '</tr>';

        while ($row = $result->fetchArray()) {

            //fake lot
            if ($row['id'] == 2042) {
                continue;
            }

            if ($row['units_remaining'] > 0) {
                $lot_basis = round(($row['units_remaining'] * $row['price']), 2);
            } else {
                $lot_basis = round(($row['units'] * $row['price']), 2);
                $lot_basis = number_format($lot_basis, 2, '.', '');
            }

            if (strtotime($row['date_new']) < strtotime('-1 year')) {
                $term = "★Long";
            } else {
                $term = "";
            }

            $clridx = ($lot_basis / 200);
            $opacity = $clridx * 255; // Calculate the opacity value between 0 and 255
            $opacityHex = str_pad(dechex(round($opacity)), 2, '0', STR_PAD_LEFT); // Convert opacity to hexadecimal value
            $color = "#00cc00$opacityHex"; // Hex color string with opacity for green

            // echo $color;

            $symbol = $row['symbol'];

            if ($row['units_remaining'] > 0) {
                $posval = round($cprice[$symbol] * $row['units_remaining'], 2);
            } else {
                $posval = round($cprice[$symbol] * $row['units'], 2);
            }

            if ($posval == 0) {
                continue;
            }

            $profit_loss = round(($posval - $lot_basis), 2);

            $pl_pct = round(($profit_loss / $posval), 3) * 100;

            //bar graph
            $width = round(($pl_pct * .27), 1) . "vw";

            //bar graph
            if ($pl_pct > 0) {
                $svg_rect = "<svg width=\"$width\" height=\"1.24vw\"><rect width=\"$width\" height=\"1.24vw\"/></svg>";
            } else {
                $svg_rect = "";
            }

            if ($profit_loss < 0) {
                $plcolor = '#ee9999';
            } 
                elseif ($profit_loss > 32) {$pcolor = "#2222ff";}
                elseif ($profit_loss > 16) {
                $plcolor = '#048504';
            } elseif ($profit_loss > 8) {
                $plcolor = '#00a500';
            } elseif ($profit_loss > 4) {
                $plcolor = '#00cc00';
            } elseif ($profit_loss > 2) {
                $plcolor = '#00df00';
            } elseif ($profit_loss > 1) {
                $plcolor = '#66ff66';
            } elseif ($profit_loss >= 0) {
                $plcolor = '#adffad';
            } else {
                $plcolor = '#000000';
            }

            if ($profit_loss < $lb) {
                continue;
            }

            if ($lot_basis < $lowbasis) {
                continue;
            }

            if ($pl_pct < $plpct) {continue;}

            if ($pterm == "Short" && $term == "Long" ) {continue;}
            if ($pterm == "Long" && $term == "" ) {continue;}

            $lotcount++;

            $cum_pl = ($cum_pl + $profit_loss);

            echo '<tr>';
            echo '<form method="post" action="">';
            echo "<td>" . $row['acct'] . '</td>';
            echo "<td style=\"background: $plcolor;\">" . $row['id'] . '</td>';
            echo "<td style=\"background: $plcolor;\">" . $term . '</td>';
            echo "<td style=\"background: $plcolor;\">" . $row['date_new'] . '</td>';
            echo "<td style=\"background: $plcolor;\">" . $row['symbol'] . '</td>';
            echo "<td style=\"background: $plcolor;\">" . $row['price'] . '</td>';
            // echo '<td>' . round($cprice[$symbol],2) . '</td>';
            echo '<td>' . $row['units'] . '</td>';
            //echo '<td><input type="number" length=8 name="unitsRemaining" value="' . $row['units_remaining'] . '"></td>';
            echo "<td> $row[units_remaining] </td>";
            echo '<input type="hidden" name="lotId" value="' . $row['id'] . '">';
            echo "<td style=\"background: $plcolor;\">" . $lot_basis . '</td>';
            echo "<td>$posval</td>\n";
            echo "<td style=\"background: $plcolor;\">$profit_loss</td><td style=\"background: $plcolor;\">$pl_pct</td>";
            echo "<td style=\"vertical-align: bottom;background: $plcolor;\">$svg_rect</td>\n";
 
            echo '</form>';
            echo '</tr>';
        }

        echo '</table></div>';
    } else {
        echo 'No open lots found.';
    }

    echo "<div class=\"status\">Lots shown $lotcount<br>
    PL shown $cum_pl</div>";

    // Close the database connection
    $database->close();


    ?>
</body>

</html>
