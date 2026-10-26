-- Converts page break markers to Word page breaks.
-- Supports:
--   * the literal text PAGEBREAK (legacy; same as pagebreak.php)
--   * <div class="pagebreak"></div>
--   * <div style="page-break-after: always"></div> (or break-after: page)

local page_break = '<w:r><w:br w:type="page" /></w:r>'

function Str(el)
  if el.text == 'PAGEBREAK' then
    return pandoc.RawInline('openxml', page_break)
  end
end

function Div(el)
  local style = el.attributes['style'] or ''
  if el.classes:includes('pagebreak')
      or style:match('page%-break%-after%s*:%s*always')
      or style:match('break%-after%s*:%s*page') then
    return pandoc.RawBlock('openxml', '<w:p>' .. page_break .. '</w:p>')
  end
end
