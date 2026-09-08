// Service worker do Portal do Colaborador — Pão & Tradição
// Guarda o "esqueleto" do app (portal.html, ícones) pra abrir instantâneo e funcionar
// mesmo sem internet. Nunca guarda chamadas ao Firebase — login, documentos, benefícios
// etc. sempre precisam vir da rede, senão a pessoa veria dado desatualizado ou travaria
// tentando logar offline.

const CACHE_NAME = 'portal-colaborador-v10';

// A página principal é obrigatória: sem ela guardada o app não abre offline, e o navegador
// deixa de oferecer a instalação de verdade (vira só um atalho na tela).
// É a pasta ('./'), que é o endereço que o app instalado abre.
const ARQUIVO_PRINCIPAL = './';

// Os demais são desejáveis. Se algum não existir no repositório, o cache continua valendo
// com o resto — antes, um único arquivo faltando derrubava a instalação inteira.
const ARQUIVOS_OPCIONAIS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // Guarda um por um: o que falhar é registrado no console e ignorado.
      const opcionais = ARQUIVOS_OPCIONAIS.map(function(url){
        return cache.add(url).catch(function(e){
          console.warn('Service worker: não consegui guardar '+url, e);
        });
      });
      return cache.add(ARQUIVO_PRINCIPAL).then(function(){
        return Promise.all(opcionais);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(chaves){
      return Promise.all(
        chaves.filter(function(k){ return k !== CACHE_NAME; })
              .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

function ehChamadaFirebase(url){
  return url.indexOf('googleapis.com') >= 0 ||
         url.indexOf('gstatic.com') >= 0 ||
         url.indexOf('firebaseapp.com') >= 0;
}

self.addEventListener('fetch', function(event){
  const req = event.request;
  if(req.method !== 'GET' || ehChamadaFirebase(req.url)){
    return; // deixa passar direto pra rede, sem interferir
  }

  // A página principal (portal.html) muda com frequência enquanto o portal está sendo
  // ajustado — por isso ela sempre busca a versão mais nova na rede primeiro, e só usa
  // a guardada se estiver mesmo sem internet. Ícones e manifest mudam raramente, então
  // esses continuam mostrando o guardado na hora (mais rápido) e atualizando por trás.
  const ehPaginaPrincipal = req.mode === 'navigate' || req.url.indexOf('index.html') >= 0;

  if(ehPaginaPrincipal){
    event.respondWith(
      fetch(req).then(function(respostaRede){
        if(respostaRede && respostaRede.status === 200){
          const copia = respostaRede.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copia); });
        }
        return respostaRede;
      }).catch(function(){
        // Sem internet: devolve a página guardada. O match direto cobre quem abriu pelo
        // endereço exato; o segundo cobre quem abriu pela pasta, sem o nome do arquivo.
        return caches.match(req).then(function(guardada){
          return guardada || caches.match(ARQUIVO_PRINCIPAL);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function(respostaCache){
      const buscaNaRede = fetch(req).then(function(respostaRede){
        if(respostaRede && respostaRede.status === 200){
          const copia = respostaRede.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copia); });
        }
        return respostaRede;
      }).catch(function(){ return respostaCache; });
      // Mostra o que já tem guardado na hora (rápido), e atualiza por trás pra próxima vez.
      return respostaCache || buscaNaRede;
    })
  );
});

// ===== Notificações =====
// O aviso chega vazio, sem texto — assim nenhum conteúdo interno trafega pelos servidores
// do Google ou da Apple. O texto que aparece na tela é buscado aqui, de um recado curto que
// o painel grava antes de disparar (só frases genéricas, tipo "um novo documento foi
// anexado"). Se a busca falhar, mostramos a mensagem padrão.
const ENDERECO_RECADO = 'https://firestore.googleapis.com/v1/projects/gestao-de-rh-paoetradicao/databases/(default)/documents/portal_avisos/atual?key=AIzaSyDyxGKkYEVxqQxW45nAR5ElQPWHh6SgSbU';

async function montarAviso(){
  let titulo = 'Há novidade para você!';
  let corpo = 'Toque para abrir o Portal do Colaborador.';
  try{
    const resposta = await fetch(ENDERECO_RECADO, { cache:'no-store' });
    if(resposta.ok){
      const dados = await resposta.json();
      const campos = (dados && dados.fields) || {};
      if(campos.titulo && campos.titulo.stringValue) titulo = campos.titulo.stringValue;
      if(campos.mensagem && campos.mensagem.stringValue) corpo = campos.mensagem.stringValue;
    }
  }catch(e){ /* fica a mensagem padrão */ }
  return self.registration.showNotification(titulo, {
    body: corpo,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'portal-novidade',
    renotify: true,          // avisa de novo mesmo se já houver uma notificação na barra
    silent: false,           // pede som e vibração ao sistema
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: './' }
  });
}

self.addEventListener('push', function(event){
  event.waitUntil(montarAviso());
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(janelas){
      // Se o portal já estiver aberto em alguma aba, traz ela para frente em vez de abrir outra.
      for(const janela of janelas){
        if(janela.url.indexOf(self.registration.scope) === 0 && 'focus' in janela) return janela.focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
