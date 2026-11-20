# Compendium — Monstros, NPCs e Masmorras

*(antes chamado FFd20 Utils)*

Criador (não gerador) de monstros e NPCs para **Final Fantasy d20 (FFd20)** e **Pathfinder 1e**,
com statblocks no formato padrão do Pathfinder, e criador de **masmorras** com mapa editável e
centenas de tabelas aleatórias de uso livre. Você define as escolhas; o programa faz as contas e aplica
automaticamente o kit de classe, tipo, subtipos, feats, MP, elementos e regras de chefe, sem impedir
que você crie conteúdo próprio.

É um aplicativo de desktop para **Windows e Linux**: clique e ele abre na própria janela.

## Instalação

Baixe o arquivo do seu sistema na página
[Releases](https://github.com/Asclia/ffd20utils/releases) do repositório:

| Sistema | Arquivo | Como abrir |
|---|---|---|
| Windows | `Compendium-…-instalador.exe` | Instala o programa e cria atalhos na Área de Trabalho e no Menu Iniciar. |
| Windows | `Compendium-…-portable.exe` | Não instala nada: clique duas vezes e o programa abre. |
| Linux | `Compendium-…-linux-x86_64.AppImage` | Clique com o botão direito → Propriedades → Permitir executar; depois clique duas vezes. |
| Linux (Ubuntu/Debian) | `Compendium-…-linux-amd64.deb` | Clique duas vezes para instalar; o programa aparece no menu de aplicativos. |

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
| **Masmorras** | Gera o mapa (salas e corredores ou cavernas) a partir de uma semente e deixa você editar tudo: pintar chão/rocha/água/escombros, arrastar para criar salas, portas, portas secretas, grades, escadas, armadilhas, baús, estátuas, pilares e altares, com desfazer. Cada sala recebe sugestões (característica, detalhe, perigo, criaturas pelo nível do grupo — da sua biblioteca ou das listas oficiais do FFd20/PF, armadilha, tesouro, oportunidade), todas re-roláveis com 🎲 e editáveis. Exporta PNG, Markdown + mapa (ZIP) ou imprime. Inclui um navegador de **tabelas aleatórias** (Maze Rats e Ironsworn: Delve). |
| **Homebrew** | Raças, subtipos, feats, habilidades e classes próprios, que passam a aparecer nos editores. Raças homebrew têm modificadores de atributo (ou +2 à escolha), tamanho, tipo, subtipos, deslocamento, idiomas, feat/graduações bônus, traços, habilidades no statblock, afinidades elementais, imunidades, sentidos e modificadores (ex.: +2 racial em Perception). |

Cada criatura e masmorra é do sistema **FFd20** ou **Pathfinder 1e** (botão no topo do editor; o
padrão para novas fica em *Biblioteca → Configurações*). No Pathfinder entram as classes, raças e
magias do PF1e (d20pfsrd), energias no lugar dos elementos do FF, magias por dia no lugar de MP e sem
regras de chefe/Limit Break.

## Cálculos automáticos

- **Feats bônus de classe** (Fighter, Monk, Ranger, Gunslinger…) aumentam o limite de feats: feats além do limite normal ocupam as vagas bônus sozinhos. Feats que a classe concede (Improved Unarmed Strike do Monk, Endurance, Scribe Scroll…) entram sozinhos no statblock.
- **Características de classe** com efeito numérico: Armor Training (Des máx. e penalidade), Bravery, Trap/Danger Sense, Weapon Training, Chosen Weapon, Expert Archer, Polearm Training, One with the Sword, bônus de CA do Monk/Ninja/Dancer/Brawler (some com armadura), Nimble, Elaborate Parry, Divine/Holy Grace, Fast Movement (respeitando a armadura), dano desarmado por nível, Bardic Knowledge, Trapfinding, Nature Sense, Hawkeye, Bodybuilding, redução de dano, imunidades (Aura of Courage, Divine Health, Purity of Body…) e outras.
- **Estados de combate** ligáveis no painel ao lado do statblock: Rage/Bloodrage, Defensive Stance, Darkside, Grit Stance, Sword/Shield Oath, Smite Evil, Inspire Courage, Studied Target, Mutagen, Flurry of Blows, além de Power Attack, Deadly Aim etc.
- **Traços raciais** lidos da página da raça: bônus de perícia, saves, CA/DMC, imunidades e o feat/graduação extra do Humano.
- **Arquétipos** trocam as características substituídas e as perícias de classe que adicionam ou removem.
- Pré-requisitos de feat checam também nível de classe ("fighter level 4th") e feats concedidos pela classe.

## Montagem automática de NPC

Na seção **⚡ Montagem automática** do editor de NPC, escolha o papel (detectado pela classe: combatente,
defensor com escudo, esgrimista, atirador, especialista, lutador desarmado ou conjurador) e clique em
**Montar NPC**. O programa preenche atributos (array heroico/básico do FFd20, +2 racial e +1 a cada 4 níveis
no atributo principal), perícias (graduações nas perícias de classe do papel), feats (respeitando
pré-requisitos, com feats bônus de classe marcados), magias (conhecidas no FFd20; por dia/conhecidas no PF1e,
priorizando os livros básicos) e equipamento (arma, armadura, escudo, itens mágicos e poções dentro da tabela de
riqueza de NPC). **🎲 Outra variação** sorteia outras escolhas e **+ nível e remontar** sobe o nível. Feats
personalizados e de homebrew são mantidos; tudo continua editável.

## Aparência

O botão **🎨 Aparência** no topo escolhe o tema (Arcano, Pergaminho, Élfico, Dracônico, Cristal,
Marfim ou automático), a cor de destaque, as fontes, o tamanho da interface, o espaçamento, o tamanho
das cartas do bestiário, ornamentos, textura e o papel/fonte do statblock. Fica salvo em cada computador.

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

## Usar a mesma biblioteca em vários computadores

O programa guarda a biblioteca numa pasta comum do computador, então qualquer aplicativo que
sincroniza pastas resolve: **Koofr**, Dropbox, MEGA, OneDrive, Google Drive para computador…

1. Instale o aplicativo de sincronização (ex.: Koofr) em cada computador e crie uma pasta sincronizada, por exemplo `Koofr/FFd20`.
2. No Compendium: **Biblioteca → Pasta da biblioteca → Escolher pasta…**, selecione essa pasta e clique em **Usar esta pasta**.
   Com *Copiar a biblioteca atual* marcado, o que você já tinha vai junto. Se a pasta já tiver uma biblioteca de outro PC, as duas são juntadas (fica a versão mais nova de cada statblock) e nada é apagado.
3. Repita nos outros computadores, escolhendo a mesma pasta sincronizada.

As configurações (como a pasta do vault do Obsidian) continuam separadas em cada computador.
Se o aplicativo de sincronização trouxer alterações com o programa aberto, a tela se atualiza sozinha.

> Use um computador por vez e espere o aplicativo de sincronização terminar antes de abrir o programa no outro.
> Se a mesma criatura for editada em dois PCs ao mesmo tempo, o aplicativo de sincronização pode criar uma "cópia em conflito"; o programa mostra só a versão mais nova.

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

Tabelas aleatórias e listas de masmorra (`tables.json`, `monsters.json`) vêm de `tools/build_tables.py`;
as classes, raças e magias do Pathfinder de `tools/build_pf.py`; os arquétipos do Pathfinder (1.168, do Archives of Nethys) de `tools/build_pf_archetypes.py`. Licenças:

- **Maze Rats** © Ben Milton — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Ironsworn: Delve** © Shawn Tomkin — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (via Datasworn).
- **Pathfinder** (classes, raças, magias, arquétipos, armadilhas, lista de monstros) — Open Game License 1.0a, via d20pfsrd.com e aonprd.com.
- Fontes **Cinzel**, **Cinzel Decorative**, **Alegreya Sans** e **EB Garamond** — SIL Open Font License (`public/fonts`).

As tabelas de criação (CR, HD por tipo, MP de criaturas, bônus de MP, riqueza de NPC, chefes) ficam
em `public/js/rules/tables.js`; tipos e subtipos em `public/js/rules/types.js`; a automação de
feats em `public/js/rules/featEffects.js`.

### Limitações conhecidas

- Os efeitos numéricos das características de classe mais comuns são aplicados (lista abaixo); características com escolhas abertas (favored enemy, domínios, talentos) continuam como texto: use *Modificadores personalizados* se precisar.
- Classes ocultistas do Pathfinder (Kineticist, Medium…) não têm tabela de classe no d20pfsrd, então não aparecem como classe (as listas de magia delas existem).
- Feats sem ⚙ são listados no statblock, mas os efeitos deles não são calculados.
- O texto dos statblocks é em inglês (padrão dos statblocks de PF1e e dos termos do FFd20); a interface é em português.

## Desenvolvimento

- Sem etapa de build na interface: HTML + módulos ES + [Preact](https://preactjs.com/) e [htm](https://github.com/developit/htm) empacotados em `public/vendor/` (licenças MIT incluídas).
- `server.js`: servidor HTTP local sem dependências (arquivos estáticos + API da biblioteca). O app desktop (`desktop/main.js`, [Electron](https://www.electronjs.org/)) o inicia por dentro e mostra a interface numa janela.
- `npm install` e depois `npm run app` abre o app desktop a partir do código; `node server.js --open` abre a mesma interface no navegador.
- Executáveis: `npm run dist:win` e `npm run dist:linux` (saem em `dist/`). Ao enviar uma tag de versão (`git tag v1.0.1 && git push origin v1.0.1`), o GitHub Actions compila Windows e Linux e publica um Release com os arquivos.
- Testes do motor de regras: `npm test`.

Ferramenta de fã, sem afiliação com a Square Enix, a Paizo ou a equipe do FFd20.
