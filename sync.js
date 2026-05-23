(function(){
var TOKEN_KEY='behaviorAllowanceGithubToken_v1';
var STATUS_ID='cloudSyncStatus';
var api=null,saveTimer=null,lastSaveReason='';

function cfg(){
  var c=window.BEHAVIOR_ALLOWANCE_SYNC||{};
  return {
    owner:c.owner||'',
    repo:c.repo||'',
    branch:c.branch||'main',
    path:c.path||'data/behavior-data.json',
    readUrl:c.readUrl||'./data/behavior-data.json'
  };
}

function byId(id){return document.getElementById(id)}

function setMessage(message,type){
  var el=byId(STATUS_ID);
  if(!el)return;
  el.className=type==='success'?'success':(type==='error'?'err':'notice');
  el.innerHTML=message;
}

function formatCount(n){return (Number(n)||0).toLocaleString('zh-CN')}

function isGithubConfigured(){
  var c=cfg();
  return !!(c.owner&&c.repo&&c.path&&c.owner.indexOf('REPLACE_WITH')<0);
}

function token(){return localStorage.getItem(TOKEN_KEY)||''}

function saveToken(value){
  value=String(value||'').trim();
  if(value)localStorage.setItem(TOKEN_KEY,value);
  else localStorage.removeItem(TOKEN_KEY);
}

function insertAdminPanel(){
  var admin=byId('adminPage'),host,html,input,save,clear,syncNow,repoText;
  if(!admin||byId('cloudSyncPanel'))return;
  host=admin.querySelector('.card');
  if(!host)return;
  repoText=isGithubConfigured()?cfg().owner+'/'+cfg().repo+' / '+cfg().path:'请先填写 sync-config.js';
  html='<div class="admin-section" id="cloudSyncPanel">'+
    '<div class="section-title"><h3>线上同步</h3><button id="btnManualCloudSync" class="btn small blue">立即同步</button></div>'+
    '<div id="'+STATUS_ID+'" class="notice">正在读取线上数据...</div>'+
    '<div class="file-mini">同步位置：'+repoText+'。令牌只保存在本机浏览器，用于把上传后的数据写入 GitHub。</div>'+
    '<div class="form-grid" style="margin-top:8px">'+
    '<div class="field"><label>GitHub 写入令牌</label><input id="githubSyncToken" type="password" placeholder="粘贴令牌后保存"></div>'+
    '</div>'+
    '<div class="admin-tools" style="margin-top:8px">'+
    '<button id="btnSaveGithubToken" class="btn small">保存令牌</button>'+
    '<button id="btnClearGithubToken" class="btn red small">清除令牌</button>'+
    '</div>'+
    '</div>';
  host.insertAdjacentHTML('afterbegin',html);
  input=byId('githubSyncToken');
  save=byId('btnSaveGithubToken');
  clear=byId('btnClearGithubToken');
  syncNow=byId('btnManualCloudSync');
  if(input&&token())input.value=token();
  if(save)save.onclick=function(){
    saveToken(input?input.value:'');
    setMessage(token()?'令牌已保存在本机。之后上传 Excel 会自动同步到线上。':'已清空令牌；上传会只保存在本机。',token()?'success':'notice');
  };
  if(clear)clear.onclick=function(){
    saveToken('');
    if(input)input.value='';
    setMessage('已清除本机令牌。', 'notice');
  };
  if(syncNow)syncNow.onclick=function(){publishState('manual')};
}

function updateFrontMessage(message,type){
  var msg=byId('queryMsg');
  if(!msg)return;
  msg.className=type==='success'?'success':(type==='error'?'err':'notice');
  msg.textContent=message;
}

function loadRemote(){
  var url=cfg().readUrl;
  if(!window.fetch){
    setMessage('当前浏览器不支持线上读取，已使用本机缓存。','error');
    return;
  }
  fetch(url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now(),{cache:'no-store'})
    .then(function(res){
      if(res.status===404)return null;
      if(!res.ok)throw new Error('读取失败：HTTP '+res.status);
      return res.json();
    })
    .then(function(state){
      var rows,cases,updatedAt;
      if(!state){
        setMessage('线上数据文件还是空的。后台上传 Excel 后可同步给朋友。','notice');
        return;
      }
      rows=Array.isArray(state.rows)?state.rows:(Array.isArray(state.data)?state.data:[]);
      cases=Array.isArray(state.cases)?state.cases:[];
      updatedAt=state.updatedAt||Date.now();
      if(api)api.setData(rows,updatedAt,true);
      if(api)api.setCases(cases,true);
      setMessage('已读取线上数据：'+formatCount(rows.length)+' 条。','success');
      updateFrontMessage(rows.length?'已读取线上数据，可以输入工号查询。':'线上暂无数据，请后台上传 Excel。',rows.length?'success':'notice');
    })
    .catch(function(err){
      setMessage('线上数据暂时读取不到，已使用本机缓存。'+err.message,'notice');
    });
}

function encodePath(path){
  return String(path||'').split('/').map(encodeURIComponent).join('/');
}

function toBase64(str){
  var bytes=new TextEncoder().encode(str),binary='',i,chunk;
  for(i=0;i<bytes.length;i+=32768){
    chunk=bytes.subarray(i,i+32768);
    binary+=String.fromCharCode.apply(null,chunk);
  }
  return btoa(binary);
}

function githubHeaders(){
  return {
    'Accept':'application/vnd.github+json',
    'Authorization':'Bearer '+token(),
    'Content-Type':'application/json',
    'X-GitHub-Api-Version':'2022-11-28'
  };
}

function githubContentUrl(){
  var c=cfg();
  return 'https://api.github.com/repos/'+encodeURIComponent(c.owner)+'/'+encodeURIComponent(c.repo)+'/contents/'+encodePath(c.path);
}

function readRemoteSha(){
  var c=cfg();
  return fetch(githubContentUrl()+'?ref='+encodeURIComponent(c.branch),{headers:githubHeaders()})
    .then(function(res){
      if(res.status===404)return null;
      if(!res.ok)return res.text().then(function(t){throw new Error(t||('GitHub 读取失败：HTTP '+res.status))});
      return res.json();
    })
    .then(function(json){return json&&json.sha?json.sha:null});
}

function buildPayload(){
  var updatedAt=api&&api.getUpdateTime?Number(api.getUpdateTime()):Date.now();
  if(!updatedAt)updatedAt=Date.now();
  return {
    schemaVersion:1,
    updatedAt:updatedAt,
    publishedAt:new Date().toISOString(),
    rows:api&&api.getData?api.getData():[],
    cases:api&&api.getCases?api.getCases():[]
  };
}

function publishState(reason){
  var c=cfg(),payload,message;
  lastSaveReason=reason||lastSaveReason||'manual';
  if(!api)return;
  if(!isGithubConfigured()){
    setMessage('还没有填写 GitHub 同步配置。请在 sync-config.js 里填入 owner 和 repo。','error');
    return;
  }
  if(!token()){
    setMessage('数据已保存在本机。要让朋友同步看到，请先填写并保存 GitHub 写入令牌。','notice');
    return;
  }
  payload=buildPayload();
  message='更新行为津贴线上数据（'+formatCount(payload.rows.length)+' 条）';
  setMessage('正在同步到 GitHub...', 'notice');
  readRemoteSha()
    .then(function(sha){
      var body={
        message:message,
        branch:c.branch,
        content:toBase64(JSON.stringify(payload,null,2))
      };
      if(sha)body.sha=sha;
      return fetch(githubContentUrl(),{
        method:'PUT',
        headers:githubHeaders(),
        body:JSON.stringify(body)
      });
    })
    .then(function(res){
      if(!res.ok)return res.text().then(function(t){throw new Error(t||('GitHub 写入失败：HTTP '+res.status))});
      return res.json();
    })
    .then(function(){
      setMessage('已同步 '+formatCount(payload.rows.length)+' 条数据到线上。GitHub Pages 通常几十秒后刷新，朋友重新打开即可看到。','success');
    })
    .catch(function(err){
      setMessage('同步失败：'+err.message+'。请检查令牌权限、仓库名和分支。','error');
    });
}

function queueSave(reason){
  lastSaveReason=reason||'data';
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){publishState(lastSaveReason)},600);
}

window.BehaviorSync={
  attach:function(appApi){
    api=appApi;
    insertAdminPanel();
    loadRemote();
  },
  queueSave:queueSave
};
})();
