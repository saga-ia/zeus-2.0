#!/usr/bin/env node
/** Instalador local. Sem rede, pacotes externos ou acesso à conta de IA. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const packageRoot=path.dirname(fileURLToPath(import.meta.url));
function fail(message){throw new Error(message)}
function existing(p){try{return fs.lstatSync(p)}catch(e){if(e.code==='ENOENT')return null;throw e}}
function safePath(p){
 const absolute=path.resolve(p),root=path.parse(absolute).root;
 let current=root;
 for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const st=existing(current);
  if(st?.isSymbolicLink())fail(`Caminho com link simbólico: ${current}. Escolha o caminho físico da pasta.`);
  if(st&&!st.isDirectory()&&current!==absolute)fail(`Uma pasta esperada é um arquivo: ${current}`);
 }
}
function inventory(dir){
 const out=[];
 function walk(folder,base=''){
  for(const name of fs.readdirSync(folder).sort()){
   const full=path.join(folder,name),rel=path.join(base,name),st=fs.lstatSync(full);
   if(st.isSymbolicLink())fail(`Link simbólico não permitido no pacote: ${rel}`);
   if(st.isDirectory())walk(full,rel);
   else if(st.isFile())out.push({rel,hash:createHash('sha256').update(fs.readFileSync(full)).digest('hex')});
   else fail(`Tipo de arquivo não suportado: ${rel}`);
  }
 }
 walk(dir);return out;
}
function sameTree(a,b){return JSON.stringify(inventory(a))===JSON.stringify(inventory(b))}
function run(){
 const argv=process.argv.slice(2),options={apply:false};
 if(!argv.length||argv.includes('--help')){
  console.log('USO\n  node instalar-skills.mjs --editor codex|claude|ambos --project "CAMINHO DO PROJETO" [--apply]\n\nSem --apply: mostra o que será instalado sem gravar.\nCom --apply: copia apenas skills novas. Pastas existentes diferentes não são sobrescritas.\nAbra a pasta do projeto no agente após instalar.');return;
 }
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(k==='--apply'){options.apply=true;continue}
  if(k==='--editor'||k==='--project'){
   if(!argv[i+1]||argv[i+1].startsWith('--'))fail(`Falta valor para ${k}`);
   options[k.slice(2)]=argv[++i];continue;
  }
  fail(`Opção desconhecida: ${k}`);
 }
 if(!['codex','claude','ambos'].includes(options.editor))fail('Escolha --editor codex, claude ou ambos.');
 if(!options.project)fail('Informe --project com a pasta existente do projeto de vídeo.');
 const project=path.resolve(options.project);
 safePath(project);
 if(!existing(project)?.isDirectory())fail('A pasta do projeto precisa existir antes da instalação.');
 const source=path.join(packageRoot,'skills');
 if(!existing(source)?.isDirectory())fail('Pasta skills ausente. Extraia o ZIP inteiro antes de executar.');
 const names=fs.readdirSync(source).filter(n=>!n.startsWith('.')).sort();
 if(!names.length)fail('Nenhuma skill encontrada.');
 for(const name of names){
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name))fail(`Nome inválido: ${name}`);
  const skill=path.join(source,name);safePath(skill);
  if(!existing(skill)?.isDirectory()||!existing(path.join(skill,'SKILL.md'))?.isFile())fail(`Skill incompleta: ${name}`);
  inventory(skill);
 }
 const editors=options.editor==='ambos'?['codex','claude']:[options.editor];
 const plan=[];
 for(const editor of editors){
  const base=path.join(project,editor==='codex'?'.agents':'.claude','skills');safePath(base);
  if(existing(base)&&!existing(base).isDirectory())fail(`Destino não é uma pasta: ${base}`);
  for(const name of names){
   const src=path.join(source,name),dest=path.join(base,name);safePath(dest);
   if(existing(dest)&&(!existing(dest).isDirectory()||!sameTree(src,dest)))fail(`CONFLITO: ${dest}\nNada foi copiado. Há uma versão diferente; preserve-a e escolha outro projeto ou resolva o conflito antes de continuar.`);
   plan.push({editor,name,src,dest,skip:!!existing(dest)});
  }
 }
 console.log(options.apply?'INSTALAÇÃO LOCAL':'PRÉVIA — nenhum arquivo será gravado');
 for(const item of plan)console.log(`${item.skip?'JÁ INSTALADA':'COPIAR'} | ${item.editor} | ${item.name} → ${item.dest}`);
 if(!options.apply){console.log('\nConfira os destinos. Acrescente --apply ao mesmo comando para instalar.');return;}
 const created=[];
 try{
  for(const item of plan){
   if(item.skip)continue;
   fs.mkdirSync(path.dirname(item.dest),{recursive:true});
   fs.mkdirSync(item.dest);created.push(item.dest);
   fs.cpSync(item.src,item.dest,{recursive:true,errorOnExist:true,force:false});
   if(!sameTree(item.src,item.dest))fail(`Verificação de cópia falhou: ${item.dest}`);
  }
 }catch(error){
  // Reverte apenas as pastas criadas por esta execução; não toca nas existentes.
  for(const dir of created.reverse())fs.rmSync(dir,{recursive:true,force:true});
  throw error;
 }
 console.log(`\nConcluído: ${created.length} instalação(ões) nova(s); ${plan.filter(x=>x.skip).length} já existente(s).\nAbra ou retome o projeto no Codex/Claude Code e confirme que a skill é reconhecida antes de editar.`);
}
try{run()}catch(e){console.error(`\nErro: ${e.message}`);process.exitCode=1}
