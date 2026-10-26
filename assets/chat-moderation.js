/* Shared by the server and local games so humans and bots use the same rules. */
(function(root){
  'use strict';
  const wordPatterns=[
    'idiot[ao]s?|imbecil|imbecis|otari[oa]s?|cretin[oa]s?|idiots?|morons?|imbecil(?:es)?|идиот(?:ы)?|дебил(?:ы)?',
    // Explicit abuse/slurs; neutral identities, relationships and politics are not keywords.
    'porra|caralh[oa]s?|merdas?|f[oou]d[aeiou][rs]?|f[oou]did[oa]s?|fodase|foda[ -]se|pqp|fdp|put[ao]s?|putaria|arrombad[oa]s?|desgra[cç]ad[oa]s?|vagabund[oa]s?|v[iy]ad[oa]s?|bucet[ao]s?|cuz[ao]+|cacete',
    'fuck(?:ing|ed|er|ers|s)?|motherfuck(?:er|ers|ing)?|shit(?:ty|head|heads)?|bullshit|bitch(?:es)?|assholes?|cunts?|dickheads?|fagg?ots?|nigg(?:er|a)s?|retards?',
    'mierda|joder|jodid[oa]s?|co[jh]ones|co[nñ]o|pendej[oa]s?|cabron(?:es)?|maric[oó]n(?:es)?|gilipollas|malparid[oa]s?|hij[oa]s? de puta',
    'бля(?:дь|ть)?|сука|суки|хуй|хуя|хуи|пизда|пиздец|пизду|ебать|ебаный|ебаная|пидор(?:ас)?|пидоры|долбоеб|уебок',
    'porn(?:o|ografia|ography)?|hentai|nudes?|boquete|punheta|masturba[cç][aã]o|masturbation|blowjobs?|cumshots?|fucking'
  ];
  const phrases=[
    'filh[oa]s? d[ae] put[ao]|vai (?:se |te )?foder|v[aá] (?:se |te )?foder|vai tomar no (?:cu|rabo)|vai se (?:matar|suicidar)|ningu[eé]m gosta de (?:voc[eê]|ti)|ninguem te quer|lixo humano|volta (?:pra|para a) cozinha|mulher nao sabe jogar|cala (?:a |essa )?boca(?: seu| sua)?',
    '(?:gay|l[eé]sbica|trans|negro|negra|judeu|judia|deficiente|autista|gordo|gorda|petista|bolsonarista|comunista|fascista)s? (?:imund[oa]s?|nojent[oa]s?|de merda)|(?:odeio|nojo de) (?:todos os |todas as )?(?:gays|l[eé]sbicas|negros|negras|judeus|trans)|(?:morte aos?|matem (?:os|as)) (?:gays|l[eé]sbicas|negros|negras|judeus|trans|petistas|bolsonaristas|comunistas)',
    'you are such an? (?<bad>idiot|moron|loser|worthless|trash)|(?:kill|hang) yourself|nobody (?:likes|wants) you|shut (?:the fuck )?up|(?:gay|black|trans|jewish) (?:scum|trash)|i hate (?:all )?(?:gays|blacks|jews)|go back to your country|women (?:cannot|cant) play|(?:go|get) (?:die|lost) in real life',
    '(?:eres|sos) (?:un[a]? )?(?:idiota|basura|inutil|imbecil)|nadie te quiere|(?:matate|suicidate)|(?:tu|t[uú]) (?:eres )?(?:basura|imbecil)|calla(?:te)? la boca',
    'убей себя|никто тебя не любит',
    'manda(?:r)? (?:uma |umas |seus? |suas? )?(?:nudes?|foto(?:s)? pelad[oa])|(?:quer|vamos|bora) transar|(?:send|show) (?:me )?(?:your )?(?:nudes?|dick|pussy|tits)|(?:suck|lick) my (?:dick|cock|balls)|quiero (?:follarte|cogerte)|manda(?:me)? (?:nudes|fotos desnuda)|пришли (?:нюдсы|голые фото)|соси (?:хуй|член)',
    '(?:vou|vamos) (?:te |v[oô]s )?matar na vida real|i (?:will|am going to) kill you in real life'
  ];
  phrases.push('(?:voc[eê]|tu|ele|ela|you|eres|sos|t[uú]|ты) (?:[eé]s? |[eé] um[a]? |are |are an? |un[a]? )?(?<bad>lixo|verme|burro|burra|idiota|imbecil|inutil|bicha|idiot|moron|loser|worthless|trash|basura|тупой|тупая|идиот|урод|мразь|ничтожество)');
  phrases.push('(?:seu|sua) (?<bad>idiota|imbecil|burro|burra|lixo|macaco|macaca|bicha)');
  const rules=[...wordPatterns,...phrases].map(p=>new RegExp('(?<![\\p{L}\\p{N}])(?:'+p.normalize('NFKD').replace(/\p{M}/gu,'')+')(?![\\p{L}\\p{N}])','gu'));
  // Also recognize common punctuation inserted inside explicit abusive words.
  for(const word of ['porra','caralho','merda','viado','foda','puta','fuck','shit','bitch','faggot','nigger','pendejo','maricon','пидор','сука']){
    const spaced=word.split('').join('[._*\\-]{0,2}');
    rules.push(new RegExp('(?<![\\p{L}\\p{N}])'+spaced+'(?![\\p{L}\\p{N}])','gu'));
  }
  // Japanese does not delimit words with spaces. Keep these to explicit abuse/sexual requests.
  rules.push(new RegExp('死ね(?![なばる])|死んでしまえ|自殺しろ|くたばれ|クソ野郎|くそ野郎|まんこ|ちんこ|セックスしよう|裸の写真を送って|ヌードを送って'.normalize('NFKD').replace(/\p{M}/gu,''),'gu'));
  rules.push(new RegExp('(?:お前|おまえ|あんた|あなた)(?:は|って)?(?<bad>バカ|ばか|馬鹿|アホ|あほ|ゴミ|雑魚)'.normalize('NFKD').replace(/\p{M}/gu,''),'gu'));
  function moderate(value){
    const source=String(value??''),map=[],ends=[];let normalized='';
    for(let i=0;i<source.length;){const point=source.codePointAt(i),ch=String.fromCodePoint(point),end=i+ch.length;
      let fold=ch.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[\u200b-\u200f\u2060\ufeff]/g,'');
      fold=fold.replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'}[c]));
      for(const letter of fold){normalized+=letter;for(let k=0;k<letter.length;k++){map.push(i);ends.push(end)}}i=end;
    }
    const hidden=new Uint8Array(source.length);
    for(const rule of rules){rule.lastIndex=0;for(const match of normalized.matchAll(rule)){const part=match.groups?.bad??match[0],offset=match.groups?.bad?match[0].lastIndexOf(part):0,start=map[match.index+offset],end=ends[match.index+offset+part.length-1];for(let i=start;i<end;i++)if(!/\s/u.test(source[i]))hidden[i]=1}}
    return source.split('').map((ch,i)=>hidden[i]?'*':ch).join('');
  }
  const api={moderate};if(typeof module==='object'&&module.exports)module.exports=api;else root.NZChatModeration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
