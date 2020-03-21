#!/usr/bin/env php
<?php
error_reporting(E_ALL & ~E_NOTICE);
require_once __DIR__ . '/./pandocfilters.php';

Pandoc_Filter::toJSONFilter(function ($type, $value, $format, $meta) use ($RawInline) {

    if ('Str' == $type && 'PAGEBREAK' == $value) {
        return $RawInline('openxml', '<w:r><w:br w:type="page" /></w:r>');
    }
});
