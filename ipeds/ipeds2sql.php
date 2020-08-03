<?php

/*
Build IPEDS SQL from CSV files

Name the CSV files:
ipeds.csv
publick12.csv
privatek12.csv
world.csv


*/

$states = ['Alabama'=>'AL',
	'Alaska'=>'AK',
	'American Samoa'=>'AS',
	'Arizona'=>'AZ',
	'Arkansas'=>'AR',
	'Bureau of Indian Education'=>'BI',
	'California'=>'CA',
	'Colorado'=>'CO',
	'Connecticut'=>'CT',
	'Delaware'=>'DE',
	'District of Columbia'=>'DC',
	'Federated States of Micronesia'=>'FM',
	'Florida'=>'FL',
	'Georgia'=>'GA',
	'Guam'=>'GU',
	'Hawaii'=>'HI',
	'Idaho'=>'ID',
	'Illinois'=>'IL',
	'Indiana'=>'IN',
	'Iowa'=>'IA',
	'Kansas'=>'KS',
	'Kentucky'=>'KY',
	'Louisiana'=>'LA',
	'Maine'=>'ME',
	'Marshall Islands'=>'MH',
	'Maryland'=>'MD',
	'Massachusetts'=>'MA',
	'Michigan'=>'MI',
	'Minnesota'=>'MN',
	'Mississippi'=>'MS',
	'Missouri'=>'MO',
	'Montana'=>'MT',
	'Nebraska'=>'NE',
	'Nevada'=>'NV',
	'New Hampshire'=>'NH',
	'New Jersey'=>'NJ',
	'New Mexico'=>'NM',
	'New York'=>'NY',
	'North Carolina'=>'NC',
	'North Dakota'=>'ND',
	'Northern Marianas'=>'MP',
	'Ohio'=>'OH',
	'Oklahoma'=>'OK',
	'Oregon'=>'OR',
	'Palau'=>'PW',
	'Pennsylvania'=>'PA',
	'Puerto Rico'=>'PR',
	'Rhode Island'=>'RI',
	'South Carolina'=>'SC',
	'South Dakota'=>'SD',
	'Tennessee'=>'TN',
	'Texas'=>'TX',
	'Utah'=>'UT',
	'Vermont'=>'VT',
	'Virgin Islands'=>'VI',
	'Virginia'=>'VA',
	'Washington'=>'WA',
	'West Virginia'=>'WV',
	'Wisconsin'=>'WI',
	'Wyoming'=>'WY'
];

class Builder {
	private $fo = null;
	private $cnt = 0;
	private $alldata = [];

	public function clearExisting() {
		if ($this->fo === null) {
			$this->fo = fopen('ipeds.sql', 'w');
		}
		fwrite($this->fo, "DELETE FROM imas_ipeds WHERE type='I' OR type='S' OR type='A' OR type='W';\n");
	}
	public function addRecord($data) {
		if (count($data) != 7) {
			echo "Eeek bad data";
			return;
		}
		foreach ($data as $k=>$v) {
			if ($k == 6) {
				if ($v === null) {
					$data[$k] = 'null';
				}
			} else {
				$data[$k] = "'".str_replace("'","\\'",$data[$k])."'";
			}
		}
		$this->alldata[] = "(".implode(",", $data).")";
		if (count($this->alldata)>100) {
			$this->recordData();
		}
	}
	public function done() {
		fclose($this->fo);
	}
	public function recordData() {
		if ($this->fo === null) {
			$this->fo = fopen('ipeds.sql', 'w');
		}
		$sql1 = "INSERT INTO imas_ipeds (type,ipedsid,school,agency,country,state,zip) VALUES ";

		fwrite($this->fo, $sql1 . implode(',', $this->alldata) . ";\n");
		$this->alldata = [];
	}
}

function cleanname($str,$agency, $ucwords=true) {
	$str = trim(mb_ereg_replace('[^\w\.\-\+\s&\']','',$str));
	if ($ucwords) {
		$str = ucwords(mb_strtolower($str));
	}
	if ($agency) {
		$str = preg_replace_callback('/\b(Sd|Isd|Psd|Ccsd|Cusd)\b/', function($m) {
			return strtoupper($m[0]);
		}, $str);
		if (str_word_count($str) === 1) {
			$str .= ' SD';
		}
	}
	return $str;
}

$builder = new Builder;

$builder->clearExisting();

$fi = fopen('ipeds.csv', 'r');
$data = fgetcsv($fi); // header row
while (($data = fgetcsv($fi)) !== false) {
	$builder->addRecord(array(
		'I',			// type
		$data[0],		// id
		$data[1],		// school name
		'',			// agency
		'US',			// country
		$states[$data[4]],	// state
		(strlen($data[5]) > 5) ? substr($data[5],0,5) : $data[5]
	));
}
$builder->recordData();

$fi = fopen('publick12.csv', 'r');
$data = fgetcsv($fi); // header row
while (($data = fgetcsv($fi)) !== false) {
	$builder->addRecord(array(
		'A',			// type
		$data[5],		// id
		cleanname($data[3],false),		// school name
		cleanname($data[4],true),			// agency
		'US',			// country
		$data[2],		// state
		(strlen($data[6]) > 5) ? substr($data[6],0,5) : $data[6]
	));
}
$builder->recordData();

$fi = fopen('privatek12.csv', 'r');
$data = fgetcsv($fi); // header row
while (($data = fgetcsv($fi)) !== false) {
	$builder->addRecord(array(
		'S',			// type
		$data[3],		// id
		cleanname($data[2],false),		// school name
		'',			// agency
		'US',			// country
		$data[4],		// state
		(strlen($data[5]) > 5) ? substr($data[5],0,5) : $data[5]
	));
}
$builder->recordData();

$fi = fopen('world.csv', 'r');
$data = fgetcsv($fi); // header row
while (($data = fgetcsv($fi)) !== false) {
	$data[1] = cleanname($data[1], false, false);
	$builder->addRecord(array(
		'W',			// type
		md5($data[1].$data[0]),	// id
		$data[1],		// school name
		'',			// agency
		$data[0],			// country
		'',		// state
		null
	));
}
$builder->recordData();

$builder->done();

