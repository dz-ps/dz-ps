import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useLocation } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { Painel } from './componentes/Painel';
import { useEstado } from './estado';
import { lerPacote, type Progresso, sincronizar } from './dados/pacotes';
import { carregarRede } from './motor/cliente';
import { Inicio } from './telas/Inicio';
import { Rotas } from './telas/Rotas';

const Mapa = lazy(() => import('./mapa/Mapa'));

async function iniciar() {
  const { definir } = useEstado.getState();
  const progresso = (p: Progresso) => definir({ fase: useEstado.getState().rede ? 'pronto' : 'baixando', progresso: p });
  // 1) Rede primeiro (dezenas de KB): libera busca e rotas antes do mapa.
  const r = await sincronizar(progresso, ['rede']);
  const rede = r.manifest?.pacotes.find((p) => p.id === 'rede');
  const arqRede = rede ? await lerPacote(rede) : null;
  if (!arqRede) {
    definir({ fase: 'erro', erro: r.erro ?? 'Pacote da rede indisponível', progresso: null });
    return;
  }
  const info = await carregarRede(await arqRede.arrayBuffer());
  const mapaLocal = r.manifest?.pacotes.find((p) => p.id === 'mapa-basico');
  definir({ fase: 'pronto', rede: info, mapaArquivo: mapaLocal ? await lerPacote(mapaLocal) : null, progresso: null, erro: null });
  // 2) Demais pacotes (mapa) em segundo plano.
  const r2 = await sincronizar(progresso);
  const mapa = r2.manifest?.pacotes.find((p) => p.id === 'mapa-basico');
  const arqMapa = mapa ? await lerPacote(mapa) : null;
  if (arqMapa && (r2.atualizou || !useEstado.getState().mapaArquivo)) definir({ mapaArquivo: arqMapa });
  definir({ progresso: null });
}

function Layout() {
  const fase = useEstado((s) => s.fase);
  const erro = useEstado((s) => s.erro);
  const local = useLocation();
  useEffect(() => {
    const on = () => useEstado.getState().definir({ online: navigator.onLine });
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', on);
    };
  }, []);
  return (
    <main className="relative h-full w-full overflow-hidden bg-fundo">
      {fase === 'pronto' && (
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-suave">Carregando mapa…</div>}>
          <Mapa />
        </Suspense>
      )}
      {fase === 'erro' && (
        <div className="absolute inset-x-4 top-4 z-20 rounded-xl bg-superficie p-4 shadow-[var(--shadow-cartao)]" role="alert">
          <p className="font-semibold">Não foi possível preparar os dados offline.</p>
          <p className="text-sm text-suave">Conecte-se à internet uma vez para baixar a rede. Detalhe: {erro}</p>
        </div>
      )}
      <Painel key={local.pathname}>
        <Outlet />
      </Painel>
    </main>
  );
}

const raiz = createRootRoute({ component: Layout });
const rotaInicio = createRoute({ getParentRoute: () => raiz, path: '/', component: Inicio });
const rotaRotas = createRoute({ getParentRoute: () => raiz, path: '/rotas', component: Rotas });
const router = createRouter({ routeTree: raiz.addChildren([rotaInicio, rotaRotas]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  useEffect(() => {
    iniciar().catch((e: unknown) => useEstado.getState().definir({ fase: 'erro', erro: String(e) }));
  }, []);
  return <RouterProvider router={router} />;
}
