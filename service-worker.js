// Service worker do Portal do Colaborador — Pão & Tradição
// Guarda o "esqueleto" do app (portal.html, ícones) pra abrir instantâneo e funcionar
// mesmo sem internet. Nunca guarda chamadas ao Firebase — login, documentos, benefícios
// etc. sempre precisam vir da rede, senão a pessoa veria dado desatualizado ou travaria
// tentando logar offline.

const CACHE_NAME = 'portal-colaborador-v4';

// A página principal é obrigatória: sem ela guardada o app não abre offline, e o navegador
// deixa de oferecer a instalação de verdade (vira só um atalho na tela).
const ARQUIVO_PRINCIPAL = './portal.html';

// Os demais são desejáveis. Se algum não existir no repositório, o cache continua valendo
// com o resto — antes, um único arquivo faltando derrubava a instalação inteira.
const ARQUIVOS_OPCIONAIS = [
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
  const ehPaginaPrincipal = req.mode === 'navigate' || req.url.indexOf('portal.html') >= 0;

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
