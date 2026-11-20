# FFd20 Utils — Criador de Monstros e NPCs

Criador (não gerador) de monstros e NPCs para **Final Fantasy d20 (FFd20)**, com statblocks no
formato padrão do **Pathfinder 1e**. Você define as escolhas; o programa faz as contas e aplica
automaticamente o kit de classe, tipo, subtipos, feats, MP, elementos e regras de chefe, sem impedir
que você crie conteúdo próprio.

É um aplicativo de desktop para **Windows e Linux**: clique e ele abre na própria janela.

## Instalação

Baixe o arquivo do seu sistema na página
[Releases](https://github.com/Asclia/ffd20utils/releases) do repositório:

| Sistema | Arquivo | Como abrir |
|---|---|---|
| Windows | `FFd20-Utils-…-instalador.exe` | Instala o programa e cria atalhos na Área de Trabalho e no Menu Iniciar. |
| Windows | `FFd20-Utils-…-portable.exe` | Não instala nada: clique duas vezes e o programa abre. |
| Linux | `FFd20-Utils-…-linux-x86_64.AppImage` | Clique com o botão direito → Propriedades → Permitir executar; depois clique duas vezes. |
| Linux (Ubuntu/Debian) | `FFd20-Utils-…-linux-amd64.deb` | Clique duas vezes para instalar; o programa aparece no menu de aplicativos. |

> O Windows pode mostrar "O Windows protegeu o computador" na primeira vez, porque o executável
> não tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.

A biblioteca (statblocks, pastas, homebrew, imagens e configurações) fica salva na pasta de dados
do usuário: `%APPDATA%\ffd20utils\biblioteca` no Windows e `~/.config/ffd20utils/biblioteca`
no Linux. O caminho exato aparece em *Biblioteca → Configurações*. Atualizar ou reinstalar o
programa não apaga a biblioteca.

## Abas

| Aba | O que faz |
|---|---|
| **Bestiário** | Tela principal: cartões com imagem, nome e CR. Agrupa por tipo, ordem alfabética, pasta ou CR; filtra por monstro/NPC e busca por nome ou tag. Clique para ver o statblock, editar, duplicar, exportar, mover ou excluir. |
| **Criação de Monstros** | Regras de criação de monstros: CR alvo; HD e armadura natural aplicados automaticamente pela tabela do PF1e (HD por tipo e CR; armadura natural que completa a CA do CR), com opção de fixar à mão; subtipos do FFd20, nível de chefe (Mini-Boss, Boss, Super Boss), MP pela *Creature MP Chart* e **análise de CR** comparando PV, CA, ataque, dano, saves e CDs com a tabela *Monster Statistics by CR*. |
| **Criação de NPCs** | Regras de NPC do FFd20: raça (modificadores, tamanho, deslocamento, traços), classes heroicas ou básicas, arrays heroico/básico, método simplificado de perícias, **CR automático** (heroico = nível − 1; básico = nível − 2; riqueza de PJ +1), tabela de equipamento em gil e Limit Breaks só para NPCs chefes. |
| **Biblioteca** | Pastas e subpastas (arrastar e soltar), seleção múltipla, mover, excluir, exportar `.md`/JSON, backup completo e importação. Configuração da pasta de exportação (vault do Obsidian). |
| **Homebrew** | Raças, subtipos, feats, habilidades e classes próprios, que passam a aparecer nos editores. Raças homebrew têm modificadores de atributo (ou +2 à escolha), tamanho, tipo, subtipos, deslocamento, idiomas, feat/graduações bônus, traços, habilidades no statblock, afinidades elementais, imunidades, sentidos e modificadores (ex.: +2 racial em Perception). |

## O que é automatizado

- **Classes (72 do FFd20):** BAB, saves, Dado de Vida, perícias de classe e pontos por nível, MP e nível máximo de magia, características por nível (com o valor atual, ex.: *Sneak Attack (+3d6)*, *Defend Ally (+4)*) e Limit Breaks. Cada característica pode ir para *Special Attacks*, *Defensive Abilities*, *SQ* ou *Aura*, receber notas (talentos escolhidos) ou mostrar a descrição completa.
- **Tipos e subtipos:** HD, BAB, saves, sentidos, imunidades e afinidades elementais (ex.: Undead absorve Sombra e é fraco a Sagrado; Fire é imune a fogo, *strong* contra gelo e fraco a água; Bomb ganha Float e Self-Destruct; Machina ganha Force Field).
- **Chefes (FFd20):** HD maximizados e PV dobrados (formato `média [máximo]`, como nos chefes oficiais), BAB total, saves bons, imunidades de chefe, Burst Mode com usos e duração (1 + 1 a cada 4 HD) e fases.
- **Ataques:** iterativos pelo BAB, ataques naturais primários/secundários, 1,5× For em duas mãos ou ataque natural único, ½ For na mão inábil e em secundários, combate com duas armas, críticos, aprimoramento, toque, tamanho e efeitos extras.
- **Feats (≈ 2.700 do FFd20 e do Pathfinder):** busca, pré-requisitos verificados e cálculo automático dos mais comuns (marcados com ⚙): Power Attack, Deadly Aim, Combat Expertise, Piranha Strike, Point-Blank Shot, Rapid Shot, Weapon Focus/Specialization, Improved Critical, Weapon Finesse, Multiattack, Two-Weapon Fighting, Dodge, Toughness, Improved Initiative, saves, Skill Focus e os feats de +2/+2 em perícias, Spell Focus, Elemental Focus, Extra MP, Armor Focus (FFd20) e outros. Feats com efeito de combate têm um botão para ligar/desligar (ex.: BAB +5, For 18 → ataque +9; com Power Attack ligado → +7 e +4 de dano, ou +6 em duas mãos).
- **MP:** MP de classe + bônus pelo atributo de conjuração e nível máximo de magia (tabela oficial), soma de multiclasse, tabela de MP de criaturas (FC/SC/PC, com coluna de chefe), CD e concentração. Magias escolhidas das listas do FFd20 (≈ 3.300).
- **Perícias, CA, CMB/CMD, iniciativa, deslocamento, espaço/alcance**, modificadores de tamanho e penalidade de armadura.
- **Arquétipos (581 do FFd20):** escolha um ou mais por classe; as características substituídas saem do statblock e as do arquétipo entram no nível certo. A linha da classe fica no formato PF (`knight (aggressor) 8`), e o programa avisa quando dois arquétipos substituem a mesma característica.
- **Talentos de classe (69 listas, 37 classes):** Knight Talents, Mage Talents, Ninja Tricks, Ki Powers, Archery Talents… com o **limite do nível atual** contado na tabela da classe (talentos avançados podem pegar talentos comuns; arquétipos que substituem talentos reduzem o limite). Aparecem no SQ como `knight talents [a, b]`, como nos statblocks do FFd20, ou na linha que você escolher.
- **Equipamento e itens mágicos:** armas +1 a +5, obra-prima e habilidades especiais (flaming, abyssal…, com o dano extra no ataque); armadura e escudo com aprimoramento; **slots do corpo** (cabeça, testa, olhos, ombros, pescoço, peito, corpo, cintura, pulsos, mãos, 2 anéis, pés), itens sem slot, consumíveis e gil. Itens maravilhosos e anéis do FFd20 (e os clássicos do PF, como Belt of Incredible Dexterity e Ring of Protection) têm os efeitos lidos da descrição: bônus de atributo, CA, saves, PV, MP, perícias, deslocamento, imunidade a status, dano elemental extra nas armas, feats concedidos. Tudo editável. O valor total é comparado com o orçamento de equipamento do NPC, e as linhas *Combat Gear* / *Other Gear* são montadas sozinhas.
- **Linha "Special Abilities"** do FFd20, abaixo de *Special Attacks*, para habilidades ativadas (como no statblock da Fran).
- **Subtipos:** os do FFd20 com regras automáticas e os 75 subtipos do Pathfinder. **Swarm** e **troop** geram o ataque automático pelo HD (`swarm (2d6 plus distraction)`, `troop (3d6+3)`), espaço/alcance e traços; **incorporeal** soma Car como deflexão.
- **Magias:** listas completas a partir das páginas de cada magia do FFd20 (escola, alcance, save), incluindo classes que usam listas de outras (Scholar, Lil' Witch, Cleric, Arithmetician).
- **Universal Monster Rules:** 169 regras do FFd20 e do Pathfinder, com o texto e a linha certa do statblock.
- **Habilidades especiais** com variáveis calculadas: escreva `{dcCon}`, `{hd}`, `{dcMental}`, `{cl}`… e o texto se atualiza sozinho. Modelos de *Universal Monster Rules* prontos (Grab, Breath Weapon, Self-Destruct, Drench, Beatdown, Mirrorskin…).
- **Modificadores personalizados** com regras de acúmulo por tipo de bônus e bônus condicionais (ex.: `+2 vs. fear`), para tudo o que não é automático.

## Imagens

Cada statblock tem um espaço para imagem: cole um **link (URL)** ou use um **arquivo local**
(botão, arrastar e soltar ou Ctrl+V). Arquivos locais são copiados para a pasta `images` da biblioteca.

## Sincronizar entre computadores (Google Drive)

O programa pode manter a mesma biblioteca em todos os seus PCs (Windows e Linux) usando o seu Google Drive.
É gratuito: usa o espaço da sua conta Google, e a biblioteca ocupa pouquíssimo.

- O programa só tem acesso aos arquivos que ele mesmo cria (permissão `drive.file`), numa pasta **FFd20 Utils** do seu Drive. O resto do seu Drive fica inacessível para ele.
- Sincroniza ao abrir, alguns segundos depois de cada alteração e a cada 3 minutos (ou pelo botão ☁ no topo).
- Se a mesma criatura for editada em dois PCs antes de sincronizar, a versão mais nova fica e a outra é guardada como cópia **"(conflito de sync)"**. Exclusões são levadas para os outros PCs.
- No app de desktop, a conexão usa as configurações de rede/proxy do sistema (útil em redes de empresa).

### Configuração (uma vez, ~5 minutos)

O Google exige que cada programa tenha uma "chave de login". Como este é um app pessoal, você cria a sua, de graça:

1. Abra o [Google Cloud Console](https://console.cloud.google.com/projectcreate) com a sua conta Google e crie um projeto (ex.: "FFd20 Utils"). Não precisa de cartão de crédito.
2. Ative a [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) nesse projeto.
3. Abra **Google Auth Platform** (em versões antigas do console: *APIs e serviços → Tela de consentimento OAuth*):
   - tipo de usuário **Externo**, nome do app (ex.: FFd20 Utils) e o seu e-mail;
   - em **Público-alvo**, clique em **Publicar app** (status "Em produção"). *Importante:* em modo de teste o Google desconecta o app a cada 7 dias. Como o app só usa a permissão `drive.file`, publicar não exige verificação.
4. Em **Clientes** (ou *Credenciais → Criar credenciais → ID do cliente OAuth*), escolha o tipo **App para computador** e crie.
5. Copie o **ID do cliente** e a **Chave secreta do cliente**.
6. No FFd20 Utils: **Biblioteca → Sincronização com Google Drive** → cole os dois → **Salvar credenciais** → **Conectar ao Google Drive**. O login abre no seu navegador; ao terminar, pode fechar a aba.

Nos outros PCs: no PC já configurado, clique em **Copiar código para outro PC**; no PC novo, cole o código no campo *"…ou cole o código de configuração"* → **Usar código** → **Conectar ao Google Drive**.
Se o PC novo já tinha statblocks, pastas ou homebrew, eles são juntados aos do Drive (nada é apagado).

> No login, o Google pode mostrar "O Google não verificou este app". É o seu próprio app: clique em **Avançado → Acessar FFd20 Utils (não seguro)** e permita o acesso.

## Exportar para o Obsidian

- **Exportar .md:** baixa o Markdown (com *frontmatter* YAML: nome, CR, tipo, subtipos, tags). Se a imagem for um arquivo local, baixa um `.zip` com o `.md` e a imagem em `attachments/`.
- **Enviar ao vault:** configure a pasta do seu vault em *Biblioteca → Configurações*; o programa grava os `.md` direto lá (opcionalmente mantendo a estrutura de pastas) e copia as imagens para a subpasta de anexos, usando `![[imagem]]`.
- **Backup JSON** de tudo (statblocks, pastas e homebrew) e importação.

## Dados das regras

Os arquivos em `public/data/` foram gerados a partir de
[finalfantasyd20.com](https://finalfantasyd20.com/) (classes, feats, magias e raças do FFd20) e
[d20pfsrd.com](https://www.d20pfsrd.com/) (índice de feats do Pathfinder, OGL). Para atualizar:

```bash
python3 tools/fetch_sources.py ./cache
```

```bash
python3 tools/build_data.py ./cache
```

As tabelas de criação (CR, HD por tipo, MP de criaturas, bônus de MP, riqueza de NPC, chefes) ficam
em `public/js/rules/tables.js`; tipos e subtipos em `public/js/rules/types.js`; a automação de
feats em `public/js/rules/featEffects.js`.

### Limitações conhecidas

- Características de classe aparecem no statblock com o valor da tabela, mas os **efeitos numéricos** delas (ex.: o bônus de CA de *Defensive Stance*) não são aplicados automaticamente: use *Modificadores personalizados*.
- Talentos (Mage Talents, Knight Talents…) e arquétipos não estão na base; anote-os na característica correspondente.
- Feats sem ⚙ são listados no statblock, mas os efeitos deles não são calculados.
- O texto dos statblocks é em inglês (padrão dos statblocks de PF1e e dos termos do FFd20); a interface é em português.

## Desenvolvimento

- Sem etapa de build na interface: HTML + módulos ES + [Preact](https://preactjs.com/) e [htm](https://github.com/developit/htm) empacotados em `public/vendor/` (licenças MIT incluídas).
- `server.js`: servidor HTTP local sem dependências (arquivos estáticos + API da biblioteca). O app desktop (`desktop/main.js`, [Electron](https://www.electronjs.org/)) o inicia por dentro e mostra a interface numa janela.
- `npm install` e depois `npm run app` abre o app desktop a partir do código; `node server.js --open` abre a mesma interface no navegador.
- Executáveis: `npm run dist:win` e `npm run dist:linux` (saem em `dist/`). Ao enviar uma tag de versão (`git tag v1.0.1 && git push origin v1.0.1`), o GitHub Actions compila Windows e Linux e publica um Release com os arquivos.
- Testes do motor de regras: `npm test`.

Ferramenta de fã, sem afiliação com a Square Enix, a Paizo ou a equipe do FFd20.
