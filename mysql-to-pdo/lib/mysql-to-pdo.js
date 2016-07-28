module.exports = {
  activate: function() {
    //atom.workspaceView.command(
    atom.commands.add('atom-workspace', {
      'mysql-to-pdo:convert': this.convert});
  },
  convert: function() {

    var editor = atom.workspace.getActiveTextEditor();
    var text = editor.getSelectedText();
    var editor = atom.workspace.getActiveTextEditor();

    var text = editor.getSelectedText();
      var curvars = [], querylines = [], afterlines=[], orig=[], valuearr = [], querytabs='', tabs='', svars = [], resn='';
      text = text.replace(/\r\n/g,"\n");
      lines = text.split("\n");
      for (i=0;i<lines.length;i++) {
        line = lines[i].replace(/\n/g,'');
        tabs = line.replace(/^(\s*).*/,"$1"); //store leading whitespace
        line = line.replace(/^(\s*)/,'');
        line = line.replace(/\/\/.*$/,''); //remove comments
        if (!line.match(/\S/)) {continue;}
        orig.push(tabs + "//DB "+line);
        if (line.substr(0,6)=='$query') {
        	line = line.substr(6);
        	line = line.replace(/\{(\$.*?\])}/g,"$1");  // change {$var['index']} to $var['index']
        	line = line.replace(/'(\$[\w_]+(\[.*?\])?)'/g, "$1");  //change '$userid' to $userid
        	//look for sqlname=$phpvar and change to :sqlname=>$phpvar
        	line = line.replace(/([\w_]+)\s*=\s*(\$[\w_]+(\[.*?\])?(\[.*?\])?)/g, function (m, svar, pvar) {
            origsvar = svar;
            if (svars.indexOf(svar)!=-1) {
              var q = 2;
              while (svars.indexOf(svar+q.toString())!=-1) {q++;}
              svar = svar+q.toString();
            }
        		curvars.push("':"+svar+"'=>"+pvar);
            svars.push(svar);
        		return origsvar+"=:"+svar;
        		}
        	);
        	line = line.replace(/\((\s*[\$\w_\[\]']+\s*,[\$\w_\[\]'\s,]+)\)/g, function (m, c) {
        		if (c.match(/\$/)) {
        			thisbits = c.split(/\s*,\s*/);
        			if (valuearr.length==0 || thisbits.length!=valuearr.length) {
        				return m;
        			} else {
        				for (var j=0;j<valuearr.length;j++) {
        					curvars.push("':"+valuearr[j]+"'=>"+thisbits[j]);
                  svars.push(valuearr[j]);
        				}
        				return "(:"+valuearr.join(", :")+")";
        			}
        		} else if (valuearr.length==0) {
        			valuearr = c.split(/\s*,\s*/);
        			return m;
        		}
        	});
          line = line.replace(/'%(\$[\w_]+(\[.*?\])?)%'/g, function(m, pvar, sub) {
            pvar = pvar.replace(/^_/,'');
            svar = pvar.substr(1);
            if (svars.indexOf(svar)!=-1) {
              var q = 2;
              while (svars.indexOf(svar+q.toString())!=-1) {q++;}
              svar = svar+q.toString();
            }
            curvars.push("':"+svar+"'=>\"%"+pvar+'%"');
            svars.push(svar);
        		return ':'+svar;
          });
        	line = line.replace(/(\$[\w_]+)(\[.*?\])?/g, function(m, pvar, sub) {
        		pvar = pvar.replace(/^_/,'');
        		if (typeof sub !== 'undefined') {
        			svar = pvar.substr(1)+'_'+sub.replace(/[\['\]]/g,'');
        			curvars.push("':"+svar+"'=>"+pvar+sub);
        		} else {
        			svar = pvar.substr(1);
              if (svars.indexOf(svar)!=-1) {
                var q = 2;
                while (svars.indexOf(svar+q.toString())!=-1) {q++;}
                svar = svar+q.toString();
              }
        			curvars.push("':"+svar+"'=>"+pvar);
        		}

            svars.push(svar);
        		return ':'+svar;
        		}
        	);
        	querylines.push(tabs+'$query'+line);
          querytabs = tabs;
        } else if (line.match(/mysql_query/)) { //is processing line
            m = line.match(/^\s*\$\w*?(\d+)\s*=/);
            if (m!==null) {
              resn = m[1];
            } else {
              resn = '';
            }
        } else if (m = line.match(/^\s*(\$\w+\[\]).*?([\w_]+)\s*=.*?(\$[\w_]+(\[.*?\])?)/)) {
            afterlines.push(tabs+ m[1]+' = "'+m[2]+'=:'+m[2]+'";');
            afterlines.push(tabs+ "$qarr[':"+m[2]+"'] = "+m[3]+";");
        } else {
        	line = line.replace("mysql_insert_id()","$DBH->lastInsertId()");
        	line = line.replace(/mysql_fetch_row\(.*?\)/,"$stm"+resn+"->fetch(PDO::FETCH_NUM)");
        	line = line.replace(/mysql_fetch_assoc\(.*?\)/,"$stm"+resn+"->fetch(PDO::FETCH_ASSOC)");
        	line = line.replace(/mysql_result\(.*?,\s*0\s*,\s*(\d+)\s*\)/, "$stm"+resn+"->fetchColumn($1)");
        	line = line.replace(/mysql_num_rows\(.*?\)/,"$stm"+resn+"->rowCount()");
          line = line.replace(/mysql_affected_rows\(.*?\)/,"$stm"+resn+"->rowCount()");
        	line = line.replace(/mysql_fetch_array\(.*?,\s*MYSQL_ASSOC\)/,"$stm"+resn+"->fetch(PDO::FETCH_ASSOC)");
          line = line.replace(/addslashes\((.*?)\)/g, "$1");
          line = line.replace(/stripslashes\((.*?)\)/g, "$1");
        	afterlines.push(tabs+line);
        }
      }
      out = orig.join("\n")+"\n";
      if (querylines.length>0) {
        if (curvars.length==0) {
          action="query";
        } else {
          action="prepare";
        }
        if (querylines.length==1) {
        	out += querytabs+"$stm"+resn+" = $DBH->"+action+"("+querylines[0].replace(/^\s*\$query\s*=\s*/,'').replace(/;$/,'')+");\n";
        } else {
        	out += querylines.join("\n")+"\n";
        	out += querytabs+"$stm"+resn+" = $DBH->"+action+"($query);\n";
        }
        if (curvars.length>0) {
          out += querytabs+"$stm"+resn+"->execute(array("+curvars.join(", ")+"));\n";
        }
      }
      if (afterlines.length>0) {
        out += afterlines.join("\n")+"\n";
      }
      //return out;
      editor.insertText(out);
    }
};
