import {spawnSync, execFileSync} from 'node:child_process';
import {readFile, chmod} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const prompt=createInterface({input:process.stdin,output:process.stdout});
const keyPath=path.join(root,'OpenRouter Key.env');
const hasKey=async()=>{
  const value=process.env.OPENROUTER_API_KEY||parseEnv(await readFile(keyPath,'utf8')).OPENROUTER_API_KEY;
  return Boolean(value?.trim());
};
try {
  if(process.argv.includes('--stop')){
    const pid=Number(await readFile('.server.pid','utf8').catch(()=>''));
    if(!Number.isInteger(pid)||pid<2){console.log('This copy is not running.');process.exitCode=0;}
    else {
      let command='';
      try{command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});}catch{}
      if(command.includes(path.join(root,'server.mjs'))){process.kill(pid,'SIGTERM');console.log('Stopped this copy of the demo.');}
      else console.log('This copy is not running. No other process was stopped.');
    }
  } else {
    await chmod(keyPath,0o600);
    while(!await hasKey()){
      console.log('Add your own OpenRouter API key in the file opening in TextEdit.');
      console.log('Paste it after OPENROUTER_API_KEY=, save the file, then return here.');
      spawnSync('/usr/bin/open',['-a','TextEdit',keyPath],{stdio:'ignore'});
      await prompt.question('Press Return after saving (the key is never entered into this window): ');
    }
    try {await import('playwright');}
    catch {
      console.log('Installing the app dependencies. This happens once and needs internet access.');
      const installed=spawnSync('npm',['ci','--omit=dev','--no-audit','--no-fund'],{cwd:root,stdio:'inherit',env:{...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'}});
      if(installed.error||installed.status!==0)throw new Error('Dependency installation failed. Check your internet connection and open Start Dominos.command again.');
    }
    await import('./launch.mjs');
    console.log('The app is ready. You can close this Terminal window. Use Stop Demo.command to stop the server.');
  }
} catch(error){
  console.error('Could not start the demo:',error.message);
  process.exitCode=1;
  if(process.stdin.isTTY)await prompt.question('Press Return to close.');
} finally {prompt.close();}
