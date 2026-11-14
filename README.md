# FFd20 Utils — Criador de Monstros e NPCs

Criador (não gerador) de monstros e NPCs para **Final Fantasy d20 (FFd20)**, com statblocks no
formato padrão do **Pathfinder 1e**. Você define as escolhas; o programa faz as contas e aplica
automaticamente o kit de classe, tipo, subtipos, feats, MP, elementos e regras de chefe, sem impedir
que você crie conteúdo próprio.

Roda no navegador, em **Windows e Linux** (e macOS), sem instalar dependências além do Node.js.

## Como rodar

1. Instale o [Node.js](https://nodejs.org/) 18 ou mais novo.
2. Inicie o programa:
   - **Windows:** dê dois cliques em `start.bat`
   - **Linux/macOS:** execute `./start.sh` (ou `node server.js --open`)
3. O navegador abre em **http://localhost:7420**.

A biblioteca fica salva em arquivos na pasta `userdata/` ao lado do programa (statblocks, pastas,
homebrew, imagens e configurações). Para usar outra pasta: `FFD20_DATA=/caminho node server.js`.
Para outra porta: `PORT=8080 node server.js`.

> Sem o servidor (por exemplo, hospedado como site estático), o programa continua funcionando,
> mas salva no armazenamento do navegador (IndexedDB) e não grava direto no vault.

## Abas

| Aba | O que faz |
|---|---|
| **Bestiário** | Tela principal: cartões com imagem, nome e CR. Agrupa por tipo, ordem alfabética, pasta ou CR; filtra por monstro/NPC e busca por nome ou tag. Clique para ver o statblock, editar, duplicar, exportar, mover ou excluir. |
| **Criação de Monstros** | Regras de criação de monstros: CR alvo, tipo e HD sugeridos (tabela PF1e), subtipos do FFd20, nível de chefe (Mini-Boss, Boss, Super Boss), MP pela *Creature MP Chart* e **análise de CR** comparando PV, CA, ataque, dano, saves e CDs com a tabela *Monster Statistics by CR*. |
| **Criação de NPCs** | Regras de NPC do FFd20: raça (modificadores, tamanho, deslocamento, traços), classes heroicas ou básicas, arrays heroico/básico, método simplificado de perícias, **CR automático** (heroico = nível − 1; básico = nível − 2; riqueza de PJ +1), tabela de equipamento em gil e Limit Breaks só para NPCs chefes. |
| **Biblioteca** | Pastas e subpastas (arrastar e soltar), seleção múltipla, mover, excluir, exportar `.md`/JSON, backup completo e importação. Configuração da pasta de exportação (vault do Obsidian). |
| **Homebrew** | Subtipos, feats, habilidades e classes próprios, que passam a aparecer nos editores. |

## O que é automatizado

- **Classes (72 do FFd20):** BAB, saves, Dado de Vida, perícias de classe e pontos por nível, MP e nível máximo de magia, características por nível (com o valor atual, ex.: *Sneak Attack (+3d6)*, *Defend Ally (+4)*) e Limit Breaks. Cada característica pode ir para *Special Attacks*, *Defensive Abilities*, *SQ* ou *Aura*, receber notas (talentos escolhidos) ou mostrar a descrição completa.
- **Tipos e subtipos:** HD, BAB, saves, sentidos, imunidades e afinidades elementais (ex.: Undead absorve Sombra e é fraco a Sagrado; Fire é imune a fogo, *strong* contra gelo e fraco a água; Bomb ganha Float e Self-Destruct; Machina ganha Force Field).
- **Chefes (FFd20):** HD maximizados e PV dobrados (formato `média [máximo]`, como nos chefes oficiais), BAB total, saves bons, imunidades de chefe, Burst Mode com usos e duração (1 + 1 a cada 4 HD) e fases.
- **Ataques:** iterativos pelo BAB, ataques naturais primários/secundários, 1,5× For em duas mãos ou ataque natural único, ½ For na mão inábil e em secundários, combate com duas armas, críticos, aprimoramento, toque, tamanho e efeitos extras.
- **Feats (≈ 2.700 do FFd20 e do Pathfinder):** busca, pré-requisitos verificados e cálculo automático dos mais comuns (marcados com ⚙): Power Attack, Deadly Aim, Combat Expertise, Piranha Strike, Point-Blank Shot, Rapid Shot, Weapon Focus/Specialization, Improved Critical, Weapon Finesse, Multiattack, Two-Weapon Fighting, Dodge, Toughness, Improved Initiative, saves, Skill Focus e os feats de +2/+2 em perícias, Spell Focus, Elemental Focus, Extra MP, Armor Focus (FFd20) e outros. Feats com efeito de combate têm um botão para ligar/desligar (ex.: BAB +5, For 18 → ataque +9; com Power Attack ligado → +7 e +4 de dano, ou +6 em duas mãos).
- **MP:** MP de classe + bônus pelo atributo de conjuração e nível máximo de magia (tabela oficial), soma de multiclasse, tabela de MP de criaturas (FC/SC/PC, com coluna de chefe), CD e concentração. Magias escolhidas das listas do FFd20 (≈ 3.300).
- **Perícias, CA, CMB/CMD, iniciativa, deslocamento, espaço/alcance**, modificadores de tamanho e penalidade de armadura.
- **Habilidades especiais** com variáveis calculadas: escreva `{dcCon}`, `{hd}`, `{dcMental}`, `{cl}`… e o texto se atualiza sozinho. Modelos de *Universal Monster Rules* prontos (Grab, Breath Weapon, Self-Destruct, Drench, Beatdown, Mirrorskin…).
- **Modificadores personalizados** com regras de acúmulo por tipo de bônus e bônus condicionais (ex.: `+2 vs. fear`), para tudo o que não é automático.

## Imagens

Cada statblock tem um espaço para imagem: cole um **link (URL)** ou use um **arquivo local**
(botão, arrastar e soltar ou Ctrl+V). Arquivos locais são copiados para `userdata/images/`.

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

- Sem etapa de build: HTML + módulos ES + [Preact](https://preactjs.com/) e [htm](https://github.com/developit/htm) empacotados em `public/vendor/` (licenças MIT incluídas).
- `server.js`: servidor HTTP local sem dependências (arquivos estáticos + API da biblioteca).
- Testes do motor de regras: `npm test`.

Ferramenta de fã, sem afiliação com a Square Enix, a Paizo ou a equipe do FFd20.
