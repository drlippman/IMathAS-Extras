<?php

$in = $_POST['html'];

$out = preg_replace_callback('|<math.*?</math>|s', function ($matches) {
	file_put_contents('tmp/temp.xml', $matches[0]);
	exec("xsltproc mmltex.xsl tmp/temp.xml", $res);
        if (strlen($res[0])>2) {
		$tex = substr($res[0],1,-1);
		$tex = str_replace('\text{\hspace{0.17em}}','',$tex);
	        return ' [latex]'.$tex.'[/latex] ';
	} else { 
		return $matches[0];
	}
 }, $in);

echo $out;

?>
