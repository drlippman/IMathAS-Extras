<?php

$fp = fopen("avgs.csv", "r");
$fpo = fopen("avgsupdate.sql", "w");

$line = fgetcsv($fp, 4096); //eat headers

while (($line = fgetcsv($fp, 4096)) !== false) {
	$avgtimestr = '0,'.$line[1].','.$line[2].','.$line[3];
	fwrite($fpo, "UPDATE imas_questionset SET avgtime='$avgtimestr' WHERE id={$line[0]};\n");
}

fclose($fp);
fclose($fpo);
echo "Done";

	
