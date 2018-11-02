<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
if (empty($_POST['html'])) {
	echo "No html";
 exit;
}

//utility


function filtergraph($str) {
	if (strpos($str,'embed')!==FALSE) {
		$str = preg_replace_callback('/<\s*embed.*?sscr=(.)(.+?)\1.*?>/','svgfiltersscrcallback',$str);
		$str = preg_replace_callback('/<\s*embed.*?script=(.)(.+?)\1.*?>/','svgfilterscriptcallback',$str);
	}
	return $str;
}
function svgfiltersscrcallback($arr) {
	global $imgcnt, $shortname, $AS;
	if (trim($arr[2])=='') {return $arr[0];}
	if (strpos($arr[0],'style')!==FALSE) {
		$sty = preg_replace('/.*style\s*=\s*(.)(.+?)\1.*/',"$2",$arr[0]);
	} else {
		$sty = "vertical-align: middle;";
	}
	
	$AS->AStoIMG(300,300);
	$AS->processShortScript($arr[2]);
	$imgname = $shortname.$imgcnt;
	$imgcnt++;
	$AS->outputimage('./imgs/'.$imgname.'.png');
	
	return ('<img src="imgs/'.$imgname.'.png" style="'.$sty.'" alt="Graphs"/>');
}
function svgfilterscriptcallback($arr) {
	global $imgcnt,$shortname, $AS;
	if (trim($arr[2])=='') {return $arr[0];}
	
	$w = preg_replace('/.*\bwidth\s*=\s*.?(\d+).*/',"$1",$arr[0]);
	$h = preg_replace('/.*\bheight\s*=\s*.?(\d+).*/',"$1",$arr[0]);
	
	if (strpos($arr[0],'style')!==FALSE) {
		$sty = preg_replace('/.*style\s*=\s*(.)(.+?)\1.*/',"$2",$arr[0]);
	} else {
		$sty = "vertical-align: middle;";
	}
	$fn = md5($arr[2].$w.$h);
		
	if (isset($_POST['doubleimgs'])) {
		$AS->AStoIMG(2*$w+0,2*$h+0);
	} else {
		$AS->AStoIMG($w+0,$h+0);
	}
	if (isset($_POST['darkgrid'])) {
		$AS->setGridColor("darkgray");
	}
	$AS->processScript($arr[2]);
	$imgname = $shortname.$imgcnt;
	$imgcnt++;
	$AS->outputimage('./imgs/'.$imgname.'.png');
	
	return ('<img src="imgs/'.$imgname.'.png" style="'.$sty.'" alt="Graphs"/>');
}


//back to the action
if (!empty($_POST['title'])) {
 $outname = preg_replace('/\W/','',$_POST['title']);
} else {
 $outname = 'convertedfile';
}

$html = $_POST['html'];
$html = str_replace('&nbsp;',' ',$html);

$imgcnt = 0;
$shortname = uniqid();
$filename = '../datatmp/'.$shortname;

$svgimgcnt = 0;
$html = preg_replace_callback('|<img[^>]*?mimetex.*?\?(.*?)"[^>]*?>|sm', function($matches) {
		return '\\\\('.urldecode($matches[1]).'\\\\)';
	},
	$html);
if (isset($_POST['convertsvg'])) {
	$html = preg_replace_callback('|<svg.*?</svg>|sm', function($matches) {
		global $svgimgcnt;
		file_put_contents("../datatmp/img$svgimgcnt.svg", $matches[0]);
		//exec("/usr/bin/convert ../datatmp/img$svgimgcnt.svg ../datatmp/img$svgimgcnt.ps");
		//exec("/usr/bin/pstoedit -f emf ../datatmp/img$svgimgcnt.ps ../datatmp/img$svgimgcnt.emf");
		exec("/usr/bin/uniconvertor ../datatmp/img$svgimgcnt.svg ../datatmp/img$svgimgcnt.pdf");
		return '<img src="img'.$svgimgcnt.'.pdf"/>';
		$svgimgcnt++;
	  },
	  $html);
} else {
	$graphfilterdir = '.';
	$html = preg_replace('|<svg.*?</svg>|sm','[IMAGE - REPLACE]', $html);
	include("asciisvgimg.php");
	$AS = new AStoIMG;
	$html = filtergraph($html);
}

file_put_contents($filename.'.html', $html);

if (isset($_POST['convertsvg'])) {
	exec('/usr/bin/pandoc '.$filename.'.html -f html+tex_math_double_backslash -o '.$filename.'.tex');
	exec('/usr/bin/pandoc '.$filename.'.tex -o '.$filename.'.docx');
} else {
	exec('/usr/bin/pandoc '.$filename.'.html -f html+tex_math_double_backslash -o '.$filename.'.docx');
}
	
header("Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document");
header('Content-Disposition: attachment; filename="'.$outname.'.docx"');
header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
header('Pragma: public');
header('Content-Length: '.filesize($filename.'.docx'));
readfile($filename.'.docx');
//unlink($filename.'.html');
//unlink($filename.'.docx');
if (isset($_POST['convertsvg'])) {
	unlink($filename.'.tex');
	for ($i=0;$i<$svgimgcnt;$i++) {
		unlink("../datatmp/img$i.svg");
		unlink("../datatmp/img$i.eps");
	}
} else {
	for ($i=0;$i<$imgcnt;$i++) {
		unlink("./imgs/$shortname$i.png");
	}
}
exit;
?>
