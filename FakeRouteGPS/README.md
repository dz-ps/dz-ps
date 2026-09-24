# 📍 FakeRoute GPS

App Android de **localização falsa com rotas programadas**: você desenha o caminho no mapa,
escolhe a velocidade e o celular "anda" sozinho pela rota.

## Funcionalidades

- 🗺️ Mapa OpenStreetMap (sem chave de API)
- 👆 Toque no mapa para adicionar pontos da rota
- 🛣️ **Seguir ruas**: o caminho entre os pontos segue as ruas reais (OSRM, a pé / bike / carro)
- 🚶 Modos Caminhada (5 km/h), Corrida (10), Bicicleta (18), Carro (40) ou velocidade personalizada
- ⚡ Mudar a velocidade durante a simulação
- ⏳ **Paradas**: tempo de espera em cada ponto (ex.: 30 s, 2:30, 5 min)
- 🔁 **Repetir (circuito)** e **Ida e volta**
- 🎲 **Variação natural**: pequenas variações de velocidade, rumo e precisão, como um GPS real
- ⏸️ Pausar / continuar / parar (também pela notificação)
- 📌 Segure no mapa para **teleportar** para um ponto fixo
- 💾 Salvar e abrir rotas; importar/exportar **GPX**
- 🔍 Busca de endereço
- Publica a posição falsa nos provedores GPS, Rede e no Fused Location (Google Play Services)

## Como obter o APK

**Opção 1 – GitHub Actions (sem instalar nada):**
1. No GitHub, abra a aba **Actions** → **Build FakeRoute GPS APK**.
2. Abra a execução mais recente (ou clique em **Run workflow**).
3. Baixe o artefato **FakeRouteGPS-apk**, descompacte e instale o `app-debug.apk` no celular
   (permita "instalar apps de fontes desconhecidas").

**Opção 2 – Android Studio:** abra a pasta `FakeRouteGPS/` e clique em ▶ Run.

**Opção 3 – linha de comando:** `cd FakeRouteGPS && ./gradlew assembleDebug`
(APK em `app/build/outputs/apk/debug/`).

## Configuração no celular (uma vez só)

1. **Ative as Opções do desenvolvedor**: Configurações › Sobre o telefone › toque 7 vezes em
   *Número da versão*.
2. Em **Opções do desenvolvedor** › **Selecionar app de local fictício** › escolha **FakeRoute GPS**.
3. Abra o app e permita **localização** e **notificações**.

## Como usar

1. Busque um endereço ou navegue no mapa.
2. Toque para adicionar os pontos da rota (o primeiro fica verde).
3. Toque em um ponto já criado para definir quanto tempo **ficar parado** nele
   (`30`, `45s`, `2:30`, `5m`, `1h`). Pontos com parada ficam laranja; "Aplicar a todos"
   usa o mesmo tempo em todos os pontos. Na ida e volta ou no circuito, as paradas se repetem.
4. Escolha o modo/velocidade e as opções.
5. Toque em **Iniciar**. O ponto azul mostra sua posição falsa.
6. Toque em **Parar** para devolver o GPS real.

> Dica: para evitar que o GPS real "brigue" com a posição falsa, deixe o modo de localização em
> "Somente dispositivo/GPS" ou desative a "Precisão de local do Google" durante o uso.

## Estrutura

| Arquivo | Função |
|---|---|
| `MainActivity.kt` | Mapa, edição da rota, controles, salvar/abrir, GPX |
| `MockLocationService.kt` | Serviço em primeiro plano que percorre a rota e injeta as localizações |
| `Net.kt` | Rotas pelas ruas (OSRM) e busca de endereços (Nominatim) |
| `Gpx.kt` | Importação e exportação GPX |
| `RouteStore.kt` | Rotas salvas |
| `Geo.kt` | Distância, rumo e deslocamentos geográficos |

⚠️ Use com responsabilidade: testes de apps, desenvolvimento, privacidade. Falsificar localização
pode violar os termos de uso de alguns apps e jogos.
