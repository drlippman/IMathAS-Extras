<?php

$fp = fopen("avgs.csv", "r");
$fpo = fopen("avgsupdate.sql", "w");

$line = fgetcsv($fp, 4096); //eat headers

while (($line = fgetcsv($fp, 4096)) !== false) {
	$str = 'UPDATE imas_questionset SET ';
	$str .= 'avgtime='.$line[1].',';
	$str .= 'avgscore='.$line[2].',';
	$str .= 'avgn='.$line[3].',';
	$str .= 'vartime='.$line[4].',';
	$str .= 'varscore='.$line[5];
	$str .= ' WHERE id='.$line[0].";\n";
	
	fwrite($fpo, $str);
}

fclose($fp);
fclose($fpo);
echo "Done";

	
