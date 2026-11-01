'use strict';
// Compact catalogs and group small UI styles; independent scripts stay separate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const write=(name,data)=>fs.writeFileSync(path.join(root,name),data);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex').slice(0,16);
for(const name of ['languages.json','assets/how-to-play-i18n.json']){
  write(name,JSON.stringify(JSON.parse(read(name))));
}
let guide=read('assets/how-to-play.js');
guide=guide.replace(/how-to-play-i18n\.json\?v=[a-f0-9]+/,'how-to-play-i18n.json?v='+hash(read('assets/how-to-play-i18n.json')));
write('assets/how-to-play.js',guide);
const css=read('assets/hide-seek.css')+'\n'+read('assets/how-to-play.css');
write('assets/ui-shared.css',css);
let html=read('index.html');
html=html.replace(/<link rel="stylesheet" href="assets\/(?:hide-seek|how-to-play|game-addons|ui-shared)\.css\?v=[a-f0-9]+">\s*/g,'');
html=html.replace('</head>','<link rel="stylesheet" href="assets/ui-shared.css?v='+hash(css)+'">\n</head>');
html=html.replace(/<script src="assets\/(?:hide-seek|how-to-play|game-addons)\.js\?v=[a-f0-9]+"><\/script>\s*/g,'');
const scripts=['hide-seek','how-to-play'].map(name=>'<script src="assets/'+name+'.js?v='+hash(read('assets/'+name+'.js'))+'"></script>').join('\n');
write('index.html',html.replace('</body>',scripts+'\n</body>'));
console.log('UI styles grouped; independent scripts preserved; catalogs compacted; asset versions refreshed.');
