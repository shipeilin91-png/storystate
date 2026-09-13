# STORYSTATE_BENCHMARK_PILOT_V0.2.2

## Benchmark 约定

本 Pilot 以《雾港》第 12 章结束时的 Mock State 为起点，连续覆盖 Chapter 13–17。文中的实体标识、事件标识和 Delta 标识仅用于 Ground Truth 对齐，不代表最终 Backend Schema。

| 标签 | 判定 |
|---|---|
| `SHOULD APPEND EVENT` | 正文明确支持事件发生；该标签只用于 Ground Truth Events，不等同于提交 State Delta |
| `SHOULD COMMIT STATE DELTA` | 正文提供直接、明确、足以改变持久状态的证据 |
| `SHOULD NOT COMMIT` | 仅属怀疑、语气、动机推测、未来计划、未完成动作，或证据不足以支持该状态 |
| Hard State | 可由正文直接判定的角色位置、道具 owner、实际 holder、道具状态、线索状态及关系中的明确行为立场；Event 本身只进入 Ground Truth Events，其 Current State Effect 才进入 Hard State Delta |
| Knowledge Boundary | 必须按“谁知道什么”分别记录；叙述者已知、读者可推断和角色已知不可互换 |
| Soft Interpretation | 可供 Writer 或 Reviewer 参考，但不能未经审核写入硬状态 |
| Negative Delta | 本章容易被误抽取、但明确不应提交的候选变化 |

状态值采用语义化名称，目标是表达测试真值，不要求实现方照搬字段名或枚举。`owner` 表示所有权，`holder` 表示当前实际持有；正文只证明持有时，不改变所有权。位置无法确定时使用“current location unresolved / unknown”，同时保留 last confirmed location，不把 `Unknown` 当作普通地点值。转述知识用“角色知道某人声称 P”表达，不引入专用 stance，也不自动确认 P。

---

## Chapter 13 急诊室的交接

### 1. Chapter Goal

让林夏从家中赶到医院，与陈默再次相遇并接收加密 USB；推进货运记录线索，同时保持林夏的有限视角，不揭露陈默的卧底身份。

### 2. Pre-state

| 类别 | 实体 | 章前状态 |
|---|---|---|
| Character | 林夏 | `location = Home`；调查记者；目标是追查父亲失踪真相 |
| Character | 陈默 | `location = Dock`；真实身份为卧底；公开身份为码头联络人 |
| Character | 顾言 | `location = Hospital`；急诊医生 |
| Knowledge | 陈默的真实身份 | 陈默知道；林夏不知道；顾言不知道 |
| Relationship | 林夏 → 陈默 | `trust = distrust` |
| Item | 加密 USB | `owner = 陈默`；`holder = 陈默`；`status = encrypted` |
| Plot Thread | USB Mystery | `status = open`；问题为“谁在篡改港口货运记录？” |
| Plot Thread | 父亲的下落 | `status = open`；问题为“那张照片是谁寄来的？” |
| Event | 顾言的来电 | 顾言邀请林夏前往医院 |

### 3. Chapter Text

急诊室的灯把雨夜照得苍白。林夏推开门，看见陈默站在走廊尽头。

“顾言说你会来。”他没有解释手臂上的伤，只从大衣里取出那枚银色 USB，放进她手里。

“保管好它。”

银色外壳下，藏着那艘货船最后的行踪。

林夏握紧冰冷的金属。她忽然明白，他也许并非码头的人。但她没有问。门后的仪器又响了一声，打断了沉默。

### 4. Ground Truth Events

| Event ID | 事件 | 参与者 | 地点 | 判定 |
|---|---|---|---|---|
| E13-01 | 林夏抵达医院急诊区 | 林夏 | Hospital | `SHOULD APPEND EVENT` |
| E13-02 | 陈默在医院将银色 USB 交给林夏 | 陈默、林夏 | Hospital | `SHOULD APPEND EVENT` |
| E13-03 | 陈默要求林夏保管 USB | 陈默、林夏 | Hospital | `SHOULD APPEND EVENT` |
| E13-04 | 林夏产生“陈默也许并非码头的人”的怀疑 | 林夏 | Hospital | 仅作知识与软解释证据，不作为身份揭露事件提交 |

建议新增事件事实：`急诊室的交接`，结果为“林夏取得 USB；陈默身份未被揭露”。

### 5. Ground Truth Hard State Delta

| Delta ID | 实体 | 属性 | Before | After | 判定 | 理由 |
|---|---|---|---|---|---|---|
| D13-01 | 林夏 | location | Home | Hospital | `SHOULD COMMIT STATE DELTA` | 林夏明确推开医院急诊区的门 |
| D13-02 | 陈默 | location | Dock | Hospital | `SHOULD COMMIT STATE DELTA` | 林夏在医院走廊明确看见陈默 |
| D13-03 | 加密 USB | holder | 陈默 | 林夏 | `SHOULD COMMIT STATE DELTA` | 陈默将 USB 放进林夏手中，且要求她保管；只证明持有转移 |
| D13-04 | USB Mystery | status | open | progressing | `SHOULD COMMIT STATE DELTA` | 关键载体已完成交接，但内容仍未解密 |

### 6. Knowledge Boundary Changes

| Knowledge ID | 主体 | 命题 | Before | After | 判定 |
|---|---|---|---|---|---|
| K13-01 | 林夏 | 陈默持有并主动交出了银色 USB | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K13-02 | 林夏 | USB 与货船最后行踪有关 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K13-03 | 林夏 | 陈默可能不只是码头联络人 | no stated suspicion | suspects | `SHOULD COMMIT STATE DELTA` 为“怀疑”；不得升级为身份知识 |
| K13-04 | 林夏 | 陈默是卧底 | unaware | unaware | `SHOULD NOT COMMIT` 为 `knows` |
| K13-05 | 顾言 | 陈默是卧底 | unaware | unaware | 无新证据，不变 |

### 7. Soft Interpretation

| Interpretation ID | 候选解释 | 判定依据 |
|---|---|---|
| S13-01 | 陈默受伤可能与码头行动有关 | 正文只写“手臂上的伤”，没有交代成因 |
| S13-02 | 陈默信任林夏 | 交付关键道具可支持该解读，但也可能只是任务需要 |
| S13-03 | 林夏对陈默的敌意有所缓和 | 她没有追问且接下 USB，但没有明确表达信任 |
| S13-04 | 顾言安排了两人见面 | 陈默说“顾言说你会来”，只能证明顾言告知了到访，不足以证明完整安排 |

以上均为 `SHOULD NOT COMMIT` 的硬状态候选。

### 8. Negative Delta

| Negative ID | 错误候选变化 | 判定 | 排除理由 |
|---|---|---|---|
| N13-01 | 林夏已知陈默是卧底 | `SHOULD NOT COMMIT` | “也许并非码头的人”只表示怀疑，不包含“卧底”这一确定身份 |
| N13-02 | 林夏 → 陈默的长期 trust 从 distrust 变为 trust | `SHOULD NOT COMMIT` | 接收道具不等于明确建立信任 |
| N13-03 | USB status 从 encrypted 变为 decrypted | `SHOULD NOT COMMIT` | 本章没有读取、输入口令或解密成功 |
| N13-04 | 顾言知道陈默的真实身份 | `SHOULD NOT COMMIT` | 顾言未参与身份相关对话 |
| N13-05 | 陈默已离开医院 | `SHOULD NOT COMMIT` | 章节结束时没有离场动作 |
| N13-06 | USB owner 从陈默变为林夏 | `SHOULD NOT COMMIT` | “放进她手里”“保管好”只证明 holder 改变，不构成所有权转让 |

### 9. Evidence

| Evidence ID | 原文证据 | 支持项 |
|---|---|---|
| EV13-01 | “急诊室的灯把雨夜照得苍白。林夏推开门” | D13-01、E13-01 |
| EV13-02 | “看见陈默站在走廊尽头” | D13-02 |
| EV13-03 | “从大衣里取出那枚银色 USB，放进她手里” | D13-03、E13-02、K13-01 |
| EV13-04 | “保管好它” | D13-03、E13-03 |
| EV13-05 | “银色外壳下，藏着那艘货船最后的行踪” | D13-04、K13-02 |
| EV13-06 | “他也许并非码头的人” | K13-03，同时否定 N13-01 |

### 10. Expected State After Chapter

| 类别 | 实体 | 章后状态 |
|---|---|---|
| Character | 林夏 | `location = Hospital` |
| Character | 陈默 | `location = Hospital` |
| Character | 顾言 | `location = Hospital` |
| Knowledge | 陈默的真实身份 | 陈默知道；林夏不知道但怀疑其公开身份不完整；顾言不知道 |
| Relationship | 林夏 → 陈默 | `trust = distrust`，不因推测自动改变 |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = encrypted` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = open` |
| Event | 急诊室的交接 | 已发生；结果为林夏取得 USB |

---

## Chapter 14 0719 的另一种读法

### 1. Chapter Goal

让林夏和顾言在医院尝试读取 USB，只解锁索引而不解密主体文件；通过伤者何叔提供的口述，把“0719”从船号重新解释为地点线索，并推动父亲下落线。

### 2. Pre-state

| 类别 | 实体 | 章前状态 |
|---|---|---|
| Character | 林夏 | `location = Hospital` |
| Character | 陈默 | `location = Hospital` |
| Character | 顾言 | `location = Hospital` |
| Knowledge | 陈默的真实身份 | 陈默知道；林夏不知道但有怀疑；顾言不知道 |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = encrypted` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = open` |
| Relationship | 林夏 → 陈默 | `trust = distrust` |

### 3. Chapter Text

林夏在处置室外等了十分钟。顾言出来时，陈默坐过的椅子已经空了。值班护士说，那个手臂受伤的男人签字离院，没留下去向。

顾言带林夏进了病案室旁的小办公室。林夏始终把 USB 握在自己手里，直到顾言拿来一台没有接入医院网络的旧电脑，她才亲手把它插进接口。

屏幕上只出现一个口令框。连续两次尝试后，文件仍然锁着。

隔壁病床忽然传来金属护栏的轻响。下午从旧码头送来的伤者何叔睁开眼，看见屏幕上的编号，声音像砂纸一样粗：“0719 不是船号。第七码头，十九号冷库。”

林夏俯下身。何叔抓住她的袖口：“你父亲让我把这句话留给你。别信货单上的日期。”

他说完便因虚弱重新昏睡。顾言确认他的生命体征稳定，林夏则在口令框输入 `PIER7-C19`。界面弹出一页目录：六份货单、三段录音和一份权限日志。她点开第一份文件，新的密钥提示立刻覆盖了正文。

“只开了目录。”林夏拔下 USB，“里面的东西还锁着。”

### 4. Ground Truth Events

| Event ID | 事件 | 参与者 | 地点 | 判定 |
|---|---|---|---|---|
| E14-01 | 陈默签字离开医院且未留下去向 | 陈默 | Hospital | `SHOULD APPEND EVENT` |
| E14-02 | 林夏与顾言在离线电脑上尝试读取 USB | 林夏、顾言 | Hospital | `SHOULD APPEND EVENT` |
| E14-03 | 何叔说明 0719 指向“第七码头十九号冷库” | 何叔、林夏、顾言 | Hospital | `SHOULD APPEND EVENT` |
| E14-04 | 何叔转达林夏父亲留下的话 | 何叔、林夏、顾言 | Hospital | `SHOULD APPEND EVENT` |
| E14-05 | 林夏用 `PIER7-C19` 解锁 USB 目录，但主体文件仍加密 | 林夏、顾言 | Hospital | `SHOULD APPEND EVENT` |

建议新增事件事实：`医院内的索引解锁`，结果为“获得 C-19 地点线索并打开 USB 目录，主体内容未解密”。

### 5. Ground Truth Hard State Delta

| Delta ID | 实体 | 属性 | Before | After | 判定 | 理由 |
|---|---|---|---|---|---|---|
| D14-01 | 陈默 | current location epistemic state | resolved at Hospital | unresolved / unknown | `SHOULD COMMIT STATE DELTA` | 护士确认其已签字离院，但没有后续位置证据；这不是名为 Unknown 的地点 |
| D14-02 | 陈默 | last confirmed location | Hospital | Hospital | 无变化 | 最后一次可确认地点仍为医院 |
| D14-03 | 加密 USB | status | encrypted | index_unlocked | `SHOULD COMMIT STATE DELTA` | 目录已显示，主体文件仍有第二层密钥 |
| D14-04 | 父亲的下落 | status | open | progressing | `SHOULD COMMIT STATE DELTA` | 获得父亲经何叔转达的具体地点线索 |
| D14-05 | 加密 USB | holder | 林夏 | 林夏 | 无变化 | 顾言提供设备，但林夏始终实际持有并亲手操作 USB |

### 6. Knowledge Boundary Changes

| Knowledge ID | 主体 | 命题 | Before | After | 判定 |
|---|---|---|---|---|---|
| K14-01 | 林夏 | 0719 指“第七码头十九号冷库”，不是船号 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K14-02 | 顾言 | 0719 指“第七码头十九号冷库”，不是船号 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K14-03 | 林夏 | 何叔声称“林夏父亲让他留下这句话” | unaware | knows that 何叔 claimed P | `SHOULD COMMIT STATE DELTA`；只提交对陈述行为的知情 |
| K14-04 | 顾言 | 何叔声称“林夏父亲让他留下这句话” | unaware | knows that 何叔 claimed P | `SHOULD COMMIT STATE DELTA`；不自动确认 P |
| K14-05 | 林夏、顾言 | USB 目录包含六份货单、三段录音和一份权限日志 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K14-06 | 林夏、顾言 | USB 主体文件内容 | unaware | unaware | 文件仍锁定 |
| K14-07 | 顾言 | 陈默是卧底 | unaware | unaware | 无相关披露 |

林夏与顾言知道何叔作出了该声称；在后续证据出现前，“父亲确实委托何叔”仍是未确认命题。

### 7. Soft Interpretation

| Interpretation ID | 候选解释 | 判定依据 |
|---|---|---|
| S14-01 | 何叔值得完全信任 | 他提供了有效口令线索，但可信度尚未被完整验证 |
| S14-02 | 陈默是在躲避林夏 | 他离院且未留去向，但动机未知 |
| S14-03 | “别信货单上的日期”表示所有日期都被篡改 | 原话没有限定具体货单，也没有说明篡改范围 |
| S14-04 | 林夏的父亲目前仍活着 | 何叔没有说明受托时间，转达行为不能证明当前生存状态 |

以上均为 `SHOULD NOT COMMIT` 的硬状态候选。

### 8. Negative Delta

| Negative ID | 错误候选变化 | 判定 | 排除理由 |
|---|---|---|---|
| N14-01 | USB status = decrypted | `SHOULD NOT COMMIT` | 只打开目录，主体文件仍要求新密钥 |
| N14-02 | USB holder = 顾言 | `SHOULD NOT COMMIT` | 顾言只提供电脑，USB 始终由林夏实际持有 |
| N14-03 | 父亲的下落 status = resolved | `SHOULD NOT COMMIT` | C-19 是线索，不是已确认的当前所在地 |
| N14-04 | 林夏父亲当前存活 | `SHOULD NOT COMMIT` | 何叔未说明受托时间 |
| N14-05 | 陈默 current location = Dock | `SHOULD NOT COMMIT` | 只能确认离开医院；current location unresolved / unknown，last confirmed location 仍为 Hospital |
| N14-06 | 顾言知道陈默是卧底 | `SHOULD NOT COMMIT` | 本章没有身份信息 |

### 9. Evidence

| Evidence ID | 原文证据 | 支持项 |
|---|---|---|
| EV14-01 | “签字离院，没留下去向” | D14-01、E14-01 |
| EV14-02 | “林夏始终把 USB 握在自己手里” | D14-05、排除 N14-02 |
| EV14-03 | “0719 不是船号。第七码头，十九号冷库” | E14-03、K14-01、K14-02 |
| EV14-04 | “你父亲让我把这句话留给你” | D14-04、E14-04、K14-03、K14-04 |
| EV14-05 | “界面弹出一页目录：六份货单、三段录音和一份权限日志” | D14-03、K14-05 |
| EV14-06 | “只开了目录……里面的东西还锁着” | D14-03、K14-06、排除 N14-01 |

### 10. Expected State After Chapter

| 类别 | 实体 | 章后状态 |
|---|---|---|
| Character | 林夏 | `location = Hospital` |
| Character | 陈默 | current location unresolved / unknown；`last confirmed location = Hospital` |
| Character | 顾言 | `location = Hospital` |
| Knowledge | 陈默的真实身份 | 陈默知道；林夏怀疑其公开身份不完整；顾言不知道 |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing`；线索指向第七码头十九号冷库 |
| Relationship | 林夏 → 陈默 | `trust = distrust` |
| Event | 医院内的索引解锁 | 已发生；主体文件仍加密 |

---

## Chapter 15 十九号冷库

### 1. Chapter Goal

让林夏与顾言抵达 C-19 并找到一张可用于后续解密的货单残页；正文只证明残页的实际 holder，不推定 owner。林夏根据日期和父亲惯用标记形成“父亲三天前亲自留下残页”的明确 belief；Chapter 15 的 Canonical World Truth 保持 unresolved，Chapter 17 再用直接证据判定并纠正。

### 2. Pre-state

| 类别 | 实体 | 章前状态 |
|---|---|---|
| Character | 林夏 | `location = Hospital` |
| Character | 陈默 | current location unresolved / unknown；`last confirmed location = Hospital` |
| Character | 顾言 | `location = Hospital` |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing`；地点线索为 C-19 |
| Knowledge | 0719 的含义 | 林夏、顾言知道；陈默是否知道不在本章前状态中推定 |
| Knowledge | 陈默的真实身份 | 林夏不知道但怀疑；顾言不知道 |

### 3. Chapter Text

凌晨一点，第七码头只剩海雾和警示灯。林夏把 USB 留在内衣口袋里，与顾言绕过封闭的货运通道，在十九号冷库门前停下。

门锁没有被撬过。林夏用何叔说出的编号试了一次，锁舌随即弹开。冷库已经断电，地面却留着尚未干透的车轮水印。

最里面的储物柜里没有人，只有半张被撕开的货单。右下角写着 `LZY`，旁边是一道反向双勾。日期栏印着三天前。

“这个记号是我父亲的。”林夏用指腹停在纸边，没有碰墨迹，“他改工程图时，总把第二个勾画反。”

她盯着日期栏，语气变得确定：“三天前他亲自来过这里。这张残页就是他留给我的。”

顾言看了看空冷库：“标记和日期能对上，但还不能证明是谁把纸放进来的。”

“我认得他的记号。”林夏没有收回判断。

顾言先拍下原位照片，再戴上手套把残页装进证物袋。他将封好的袋子递给林夏。残页背面有一串分成三组的字符，与 USB 第二层密钥提示的长度完全一致。

通道外传来脚步声。林夏的手机同时亮起，一条来自陈默号码的信息只有一句：`别走正门。货架后有维修梯。`

她没有回复，也没有删除信息。她把证物袋收进外套，对顾言说：“走维修梯。至于他，我还没决定信不信。”

### 4. Ground Truth Events

| Event ID | 事件 | 参与者 | 地点 | 判定 |
|---|---|---|---|---|
| E15-01 | 林夏与顾言进入第七码头十九号冷库 | 林夏、顾言 | C-19 | `SHOULD APPEND EVENT` |
| E15-02 | 两人在储物柜中发现货单残页 | 林夏、顾言 | C-19 | `SHOULD APPEND EVENT` |
| E15-03 | 顾言拍摄原位照片并将残页封装后交给林夏 | 顾言、林夏 | C-19 | `SHOULD APPEND EVENT` |
| E15-04 | 陈默号码发来避开正门、使用维修梯的信息 | 信息发送者未独立核验、林夏 | C-19 | `SHOULD APPEND EVENT` 为“收到来自该号码的信息” |
| E15-05 | 林夏与顾言决定走维修梯 | 林夏、顾言 | C-19 | `SHOULD APPEND EVENT` |

建议新增事件事实：`C-19 搜索`，结果为“取得货单残页并开始经维修梯撤离”。

### 5. Ground Truth Hard State Delta

| Delta ID | 实体 | 属性 | Before | After | 判定 | 理由 |
|---|---|---|---|---|---|---|
| D15-01 | 林夏 | location | Hospital | C-19 | `SHOULD COMMIT STATE DELTA` | 正文明确写她到达并进入冷库 |
| D15-02 | 顾言 | location | Hospital | C-19 | `SHOULD COMMIT STATE DELTA` | 顾言与林夏同行并操作现场物证 |
| D15-03 | 货单残页 | entity | absent | created | `SHOULD COMMIT STATE DELTA` | 新道具被发现，具备可识别内容与来源 |
| D15-04 | 货单残页 | owner | unresolved | unresolved | 无变化 | 正文没有所有权证据 |
| D15-05 | 货单残页 | holder | none | 林夏 | `SHOULD COMMIT STATE DELTA` | 顾言封装后交给林夏，林夏收进外套，只证明实际持有 |
| D15-06 | USB Mystery | status | progressing | progressing | 无变化 | 获得潜在密钥，但尚未实际完成第二层解密 |
| D15-07 | 加密 USB | status | index_unlocked | index_unlocked | 无变化 | 字符串尚未输入，不能提前提交解密 |

### 6. Knowledge Boundary Changes

| Knowledge ID | 主体 | 命题 | Before | After | 判定 |
|---|---|---|---|---|---|
| K15-01 | 林夏 | C-19 的货单残页带有父亲惯用的 `LZY` 与反向双勾 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K15-02 | 顾言 | 林夏声称反向双勾是其父亲惯用标记 | unaware | knows that 林夏 claimed P | `SHOULD COMMIT STATE DELTA`；不自动确认标记作者 |
| K15-03 | 林夏、顾言 | 残页背面字符长度与 USB 第二层密钥提示一致 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K15-04 | 林夏 | 陈默号码建议他们走维修梯 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K15-05 | 顾言 | 陈默号码建议他们走维修梯 | unaware | knows | `SHOULD COMMIT STATE DELTA`，林夏当面说出选择 |
| K15-06 | 林夏、顾言 | 信息一定由陈默本人发送 | unaware | unaware | 号码来源不能单独证明实际发送者 |
| K15-07 | 林夏、顾言 | 林夏父亲目前位于 C-19 | unaware | unaware | 冷库内没有人 |
| K15-08 | 林夏 | 父亲三天前亲自到过 C-19，并亲手留下残页 | no belief | believes(true) | `SHOULD COMMIT STATE DELTA` 为角色 belief；Canonical World Truth 此时为 unresolved |
| K15-09 | 顾言 | 父亲三天前亲自到过 C-19，并亲手留下残页 | unaware | unknown / not adopted | 顾言明确指出证据不足，没有接受林夏的 belief |

Canonical World Truth：`unresolved`。Chapter 15 时点的 StoryState 只知道现有证据不足以确认或否定“父亲三天前亲自到 C-19 并留下残页”。林夏明确持有 `believes(true)`，顾言未采纳。

Benchmark 作者可见但不得作为 Chapter 15 StoryState Canonical State 输入：`hidden_author_truth = false`。该隐藏标注只用于验证 Chapter 17 的后续纠正链。

### 7. Soft Interpretation

| Interpretation ID | 候选解释 | 判定依据 |
|---|---|---|
| S15-01 | 货单残页上的标记由林夏父亲亲笔写下 | 林夏识别出惯用标记，但本章仍缺少独立鉴定；该命题与“谁把残页放进冷库”不同 |
| S15-02 | 日期栏“三天前”就是父亲写下标记的时间 | 日期印在货单上，不等于签写或放置时间 |
| S15-03 | 车轮水印说明有人刚刚转移了林夏父亲 | 水印只证明近期有车辆经过 |
| S15-04 | 陈默正在保护林夏 | 信息内容有保护效果，但发送者和动机都未确认 |
| S15-05 | 林夏开始信任陈默 | 她明确说“还没决定信不信”，不能反向推定信任已建立 |

以上均为 `SHOULD NOT COMMIT` 的硬状态候选。

### 8. Negative Delta

| Negative ID | 错误候选变化 | 判定 | 排除理由 |
|---|---|---|---|
| N15-01 | USB status = decrypted | `SHOULD NOT COMMIT` | 只发现疑似密钥，尚未输入或验证 |
| N15-02 | 父亲的下落 status = resolved | `SHOULD NOT COMMIT` | C-19 无人，残页只构成历史线索 |
| N15-03 | Canonical World State：林夏父亲三天前亲自在 C-19 并留下残页 | `SHOULD NOT COMMIT` | Chapter 15 的 Canonical World Truth 为 unresolved；只能提交林夏的 `believes(true)`，不能提交命题为真或为假 |
| N15-04 | 林夏 → 陈默 trust = trust | `SHOULD NOT COMMIT` | 林夏明确保留判断 |
| N15-05 | 陈默 location = C-19 | `SHOULD NOT COMMIT` | 只有来自其号码的信息，没有目击或定位证据 |
| N15-06 | 货单残页 owner = 林夏或顾言 | `SHOULD NOT COMMIT` | 封装和递交只证明 holder；owner unresolved |

### 9. Evidence

| Evidence ID | 原文证据 | 支持项 |
|---|---|---|
| EV15-01 | “在十九号冷库门前停下”“锁舌随即弹开” | D15-01、D15-02、E15-01 |
| EV15-02 | “只有半张被撕开的货单” | D15-03、E15-02 |
| EV15-03 | “右下角写着 `LZY`，旁边是一道反向双勾。日期栏印着三天前” | K15-01；是 K15-08 的有限输入，但不证明其内容为真 |
| EV15-04 | “三天前他亲自来过这里。这张残页就是他留给我的”“我认得他的记号” | K15-08：林夏明确形成 `believes(true)`；不改变 Canonical World Truth 的 unresolved 状态 |
| EV15-05 | “还不能证明是谁把纸放进来的” | K15-09，并阻止把 K15-08 写成 World State |
| EV15-06 | “顾言先拍下原位照片……将封好的袋子递给林夏” | D15-05、E15-03 |
| EV15-07 | “与 USB 第二层密钥提示的长度完全一致” | K15-03，但不足以支持 N15-01 |
| EV15-08 | “一条来自陈默号码的信息” | E15-04、K15-04，同时限制 K15-06 |
| EV15-09 | “至于他，我还没决定信不信” | 排除 N15-04 |

### 10. Expected State After Chapter

| 类别 | 实体 | 章后状态 |
|---|---|---|
| Character | 林夏 | `location = C-19`，正准备经维修梯撤离 |
| Character | 陈默 | current location unresolved / unknown；`last confirmed location = Hospital` |
| Character | 顾言 | `location = C-19`，正准备经维修梯撤离 |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Item | 货单残页 | `owner = unresolved`；`holder = 林夏`；背面有疑似第二层密钥 |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing`；尚无当前所在地结论 |
| Relationship | 林夏 → 陈默 | `trust = distrust`；林夏明确保留判断 |
| Knowledge | 陈默的真实身份 | 林夏不知道但怀疑；顾言不知道 |
| Belief | 父亲与残页 | Canonical World Truth = unresolved；林夏 = `believes(true)`；顾言 = unknown / not adopted；`hidden_author_truth = false` 不进入 Canonical State |
| Event | C-19 搜索 | 已发生；结果为取得货单残页 |

---

## Chapter 16 维修梯下

### 1. Chapter Goal

让林夏、顾言和陈默在撤离过程中会合，并制造严格的非对称身份披露：陈默只向顾言出示卧底警察凭证，林夏因空间隔离没有看见或听见。

### 2. Pre-state

| 类别 | 实体 | 章前状态 |
|---|---|---|
| Character | 林夏 | `location = C-19` |
| Character | 陈默 | current location unresolved / unknown；`last confirmed location = Hospital` |
| Character | 顾言 | `location = C-19` |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Item | 货单残页 | `owner = unresolved`；`holder = 林夏` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing` |
| Knowledge | P = “陈默是市刑侦支队警察，并正在港务安保中卧底” | 陈默知道；林夏 `unaware`；顾言 `unaware` |
| Suspicion | “陈默的公开身份不完整” | 林夏保持 `suspects`；该命题不等于 P |
| Belief | 父亲与残页 | Canonical World Truth = unresolved；林夏保持 `believes(true)`；`hidden_author_truth = false` 不进入 Canonical State |
| Relationship | 林夏 → 陈默 | `trust = distrust` |

### 3. Chapter Text

货架后的维修梯通向一条狭窄夹层。林夏先下去，证物袋和 USB 都贴身放着。顾言刚踏上第二级，冷库正门便被人撞开，手电光扫过货架。

一只手从阴影里拉住顾言。陈默把食指压在唇前，示意他别出声，又指了指下方。林夏已经转过弯，只能看见她手电的余光。

顾言没有动：“我凭什么跟你走？”

陈默从衬衣内侧抽出一张带照片的警官证，翻开后压低声音：“市刑侦支队，陈默，警号 071306。我在港务安保里卧底。证件右下角有动态警徽，你在系统里查过这种防伪。”

顾言看见徽记随角度变色，也认出证件格式。他问：“为什么不告诉林夏？”

“她父亲的案子里有人盯着她。等我们离开监控区，我亲口说。”陈默收起证件，“现在先带她出去。”

两人沿梯子下到维护隧道。林夏回头时，只看见陈默从顾言身后落地。

“信息是你发的？”她问。

“是。”

林夏盯了他一秒，没有继续问。顾言也没有转述刚才的对话。三个人沿着维护隧道向旧泵房方向撤离。

### 4. Ground Truth Events

| Event ID | 事件 | 参与者 | 地点 | 判定 |
|---|---|---|---|---|
| E16-01 | 有人从冷库正门进入并用手电搜索 | 身份不明者 | C-19 | `SHOULD APPEND EVENT` |
| E16-02 | 陈默在维修梯入口与顾言会合 | 陈默、顾言 | C-19 | `SHOULD APPEND EVENT` |
| E16-03 | 陈默只向顾言出示警官证并明确自称卧底 | 陈默、顾言 | C-19 维修梯入口 | `SHOULD APPEND EVENT` |
| E16-04 | 顾言通过动态警徽和证件格式核验凭证表面真实性 | 顾言、陈默 | C-19 维修梯入口 | `SHOULD APPEND EVENT` |
| E16-05 | 三人进入维护隧道并向旧泵房撤离 | 林夏、陈默、顾言 | Maintenance Tunnel | `SHOULD APPEND EVENT` |
| E16-06 | 陈默承认上一章的信息由他本人发送 | 陈默、林夏 | Maintenance Tunnel | `SHOULD APPEND EVENT` |

建议新增事件事实：`C-19 撤离`，结果为“三人进入维护隧道；陈默的卧底身份仅向顾言披露”。

### 5. Ground Truth Hard State Delta

| Delta ID | 实体 | 属性 | Before | After | 判定 | 理由 |
|---|---|---|---|---|---|---|
| D16-01 | 林夏 | location | C-19 | Maintenance Tunnel | `SHOULD COMMIT STATE DELTA` | 她先下梯并沿隧道撤离 |
| D16-02 | 顾言 | location | C-19 | Maintenance Tunnel | `SHOULD COMMIT STATE DELTA` | 顾言与陈默随后进入隧道 |
| D16-03 | 陈默 | current location epistemic state / location | unresolved / unknown；last confirmed Hospital | resolved at Maintenance Tunnel | `SHOULD COMMIT STATE DELTA` | 陈默被直接目击并进入隧道 |
| D16-04 | 加密 USB | owner / holder / status | 陈默 / 林夏 / index_unlocked | 陈默 / 林夏 / index_unlocked | 无变化 | 林夏贴身持有，未执行解密，也无所有权转让 |
| D16-05 | 货单残页 | owner / holder | unresolved / 林夏 | unresolved / 林夏 | 无变化 | 林夏贴身持有，未发生交接或 ownership 证据 |

### 6. Knowledge Boundary Changes

| Knowledge ID | 主体 | 命题 | Before | After | 判定 |
|---|---|---|---|---|---|
| K16-01 | 顾言 | P = “陈默是市刑侦支队警察，并正在港务安保中卧底” | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K16-02 | 顾言 | 陈默出示的证件具备其熟悉的动态警徽与正确格式 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K16-03 | 林夏 | P = “陈默是市刑侦支队警察，并正在港务安保中卧底” | unaware | unaware | `SHOULD NOT COMMIT` 为 `knows` |
| K16-04 | 林夏 | Chapter 15 的短信确由陈默本人发送 | suspected | knows | `SHOULD COMMIT STATE DELTA` |
| K16-05 | 陈默 | 林夏尚未收到其身份披露 | knows | knows | 他明确计划离开监控区后再亲口说明 |
| K16-06 | 顾言 | 陈默计划稍后亲自向林夏说明身份 | unaware | knows | `SHOULD COMMIT STATE DELTA` |

`K16-01` 的 basis / provenance 为：陈默直接披露 P，加上顾言检查警官证、动态警徽与证件格式。E16-03 可保留“陈默声称 P”这一 Reported Proposition，但它不替代 `CharacterKnowledge[顾言, P]` 的正式 `unaware → knows` Delta。

林夏对 P 保持 `unaware`。她可以继续对独立命题“陈默的公开身份不完整”保持 `suspects`；该怀疑不得归一化为对 P 的怀疑或知识。

### 7. Soft Interpretation

| Interpretation ID | 候选解释 | 判定依据 |
|---|---|---|
| S16-01 | 闯入冷库的人属于港务安保 | 手电搜索和撞门不足以确认组织归属 |
| S16-02 | 顾言已经完全信任陈默 | 顾言跟随撤离并核验证件，但没有表达无保留信任 |
| S16-03 | 陈默隐瞒身份是为了保护林夏 | 这是陈默自己的解释，动机尚未被独立验证 |
| S16-04 | 林夏从顾言的反应猜出了陈默身份 | 正文没有写出该推断，且她只问了短信 |
| S16-05 | 三人已经安全脱险 | 他们仍在撤离途中 |

以上均为 `SHOULD NOT COMMIT` 的硬状态候选。

### 8. Negative Delta

| Negative ID | 错误候选变化 | 判定 | 排除理由 |
|---|---|---|---|
| N16-01 | 林夏知道陈默是卧底 | `SHOULD NOT COMMIT` | 她已转过弯，只能看见手电余光；顾言没有转述 |
| N16-02 | 林夏 → 陈默 trust = trust | `SHOULD NOT COMMIT` | 她只确认短信来源，没有表达信任 |
| N16-03 | 三人 location = Old Pump House | `SHOULD NOT COMMIT` | 旧泵房只是移动目标，尚未抵达 |
| N16-04 | C-19 入侵者 = 港务安保 | `SHOULD NOT COMMIT` | 入侵者身份未揭示 |
| N16-05 | USB status = decrypted | `SHOULD NOT COMMIT` | 本章未使用残页字符解密 |
| N16-06 | 货单残页 holder = 陈默或顾言 | `SHOULD NOT COMMIT` | 林夏仍贴身持有；owner 继续 unresolved |

### 9. Evidence

| Evidence ID | 原文证据 | 支持项 |
|---|---|---|
| EV16-01 | “林夏先下去，证物袋和 USB 都贴身放着” | D16-04、D16-05 |
| EV16-02 | “林夏已经转过弯，只能看见她手电的余光” | 排除 N16-01 |
| EV16-03 | “市刑侦支队，陈默，警号 071306。我在港务安保里卧底” | E16-03；作为 direct disclosure 支持 K16-01 |
| EV16-04 | “顾言看见徽记随角度变色，也认出证件格式” | E16-04、K16-02；作为 credential inspection 支持 K16-01 |
| EV16-05 | “等我们离开监控区，我亲口说” | K16-05、K16-06 |
| EV16-06 | “顾言也没有转述刚才的对话” | K16-03、排除 N16-01 |
| EV16-07 | “‘信息是你发的？’……‘是。’” | E16-06、K16-04 |
| EV16-08 | “沿着维护隧道向旧泵房方向撤离” | D16-01、D16-02、D16-03，并排除 N16-03 |

### 10. Expected State After Chapter

| 类别 | 实体 | 章后状态 |
|---|---|---|
| Character | 林夏 | `location = Maintenance Tunnel` |
| Character | 陈默 | `location = Maintenance Tunnel` |
| Character | 顾言 | `location = Maintenance Tunnel` |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Item | 货单残页 | `owner = unresolved`；`holder = 林夏` |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing` |
| Knowledge | P = “陈默是市刑侦支队警察，并正在港务安保中卧底” | 陈默 `knows`；顾言 `knows`；林夏 `unaware` |
| Suspicion | “陈默的公开身份不完整” | 林夏保持 `suspects`；不等于知道或怀疑完整命题 P |
| Relationship | 林夏 → 陈默 | `trust = distrust` |
| Event | C-19 撤离 | 进行结果已记录；三人在维护隧道中，尚未抵达旧泵房 |
| Belief | 父亲与残页 | Canonical World Truth 仍为 unresolved；林夏保持 `believes(true)`；尚未出现可提交的纠正证据 |

---

## Chapter 17 三天前的录音

### 1. Chapter Goal

使用货单残页完成 USB 第二层解密，明确回答“谁篡改了货运记录”；让陈默向林夏直接披露卧底身份，并形成当前撤离范围内的 explicit bounded cooperation / declared trust stance；用三天前的录音推进父亲下落，但不把历史存活证据误写成当前存活或当前位置。

### 2. Pre-state

| 类别 | 实体 | 章前状态 |
|---|---|---|
| Character | 林夏 | `location = Maintenance Tunnel` |
| Character | 陈默 | `location = Maintenance Tunnel` |
| Character | 顾言 | `location = Maintenance Tunnel` |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = index_unlocked` |
| Item | 货单残页 | `owner = unresolved`；`holder = 林夏`；背面有疑似第二层密钥 |
| Plot Thread | USB Mystery | `status = progressing` |
| Plot Thread | 父亲的下落 | `status = progressing` |
| Knowledge | 陈默的真实身份 | 陈默、顾言知道；林夏不知道但怀疑 |
| Relationship | 林夏 → 陈默 | long-term trust state = `distrust`；尚无 explicit bounded cooperation stance |
| Belief | 父亲与残页 | Canonical World Truth = unresolved；林夏 = `believes(true)`；`hidden_author_truth = false` 不作为 Pre-state 输入 |

### 3. Chapter Text

旧泵房的铁门还能从里面插上。顾言用工具柜顶住门，陈默关掉三个人的手机信号，林夏则把那台离线电脑放在生锈的控制台上。

她取出货单残页，将背面的三组字符输入 USB 的第二层密钥框。进度条走到尽头，六份货单、三段录音和权限日志全部变为可读取状态。

权限日志里，每一次删除、改号和日期回填都来自同一台专属终端 `ZQ-OFFICE-01`，该终端固定安装在周启明的独立办公室，不接受远程登录。每次操作都同时通过周启明实名账户、现场人脸活体挑战和指纹动态认证；审计链没有代签、密钥导出或认证失败记录。终端摄像审计帧还逐次显示周启明本人坐在屏幕前完成确认。唯一授权日志把这些操作绑定到只配发给他的密钥 `ZQ-MSA-01`。被篡改的记录把运往十九号冷库的设备改写成了不存在的货船。

“所以不是系统故障。”顾言说。

“是周启明在改货运记录。”林夏把权限日志复制到离线电脑。

陈默没有回避她的目光。他取出刚才给顾言看过的警官证，放在控制台上：“市刑侦支队。过去十八个月，我以码头联络人的身份进入港务安保。卧底任务的目标就是周启明。”

林夏逐项看过照片、姓名和动态警徽，又看向顾言。顾言说：“我在维修梯口看过，格式和防伪都对。”

沉默片刻，林夏把证件推回陈默面前：“这一次我信你。先带我们离开这里，别替我决定下一步。”

她点开日期最新的录音。父亲的声音从扬声器里传出：“林夏，如果你听到这段话，说明何叔把编号交给了你。今天是六月十七日。我没有去过十九号冷库。那张带反向双勾的残页，是我一个月前写好后交给何叔的；他会替我放进 C-19。货单上六月十七日的日期，是周启明后来回填的。别用它判断我什么时候到过那里。我被转移前看见周启明签了下一批货单。他们会把我送去北堤中转站。”

同一目录中的 C-19 门禁审计与无剪辑监控片段提供了独立记录：三天前只有何叔刷证进入储物区，并把证物袋中的残页放入柜内；父亲的身份记录、面部影像和同行痕迹均未出现。影像时间与残页入柜时间一致。

林夏重新看向残页：“所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的，日期也是回填的。”顾言点头：“录音、门禁和影像对上了。”

电脑右下角显示六月二十日凌晨。录音证明父亲在三天前录下这段话，纠正了林夏关于残页来源的 belief，也给出了“北堤中转站”这一去向；它没有证明他此刻仍在那里，也没有证明他此刻平安。

门外再次响起金属摩擦声。陈默收好证件，指向泵房后侧的排水通道。三人带上 USB、货单残页和复制出的日志，准备继续撤离。

### 4. Ground Truth Events

| Event ID | 事件 | 参与者 | 地点 | 判定 |
|---|---|---|---|---|
| E17-01 | 林夏用货单残页字符完成 USB 第二层解密 | 林夏、顾言、陈默 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-02 | 三人读取实名动态认证、专属终端、摄像审计帧和唯一授权日志，确认周启明本人执行了记录篡改 | 林夏、顾言、陈默 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-03 | 陈默向林夏出示警官证并明确说明卧底身份与任务目标 | 陈默、林夏、顾言 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-04 | 林夏核验证件并明确表达“这一次我信你” | 林夏、陈默、顾言 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-05 | 三人播放林夏父亲于六月十七日录制的音频 | 林夏、陈默、顾言、录音中的父亲 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-06 | 录音说明父亲被转移前预计送往北堤中转站 | 录音中的父亲 | 历史地点未知 | `SHOULD APPEND EVENT` 为历史陈述 |
| E17-07 | 三人准备经排水通道继续撤离 | 林夏、陈默、顾言 | Old Pump House | 计划已形成，但尚未发生位置迁移 |
| E17-08 | 录音明确说明残页由父亲一个月前交给何叔、由何叔放入 C-19，日期为周启明回填；林夏明确纠正此前 belief | 林夏、顾言、陈默、录音中的父亲 | Old Pump House | `SHOULD APPEND EVENT` |
| E17-09 | 三人读取 C-19 门禁与无剪辑监控，确认何叔三天前放入残页且父亲未到场 | 林夏、顾言、陈默；影像中的何叔 | Old Pump House / 历史 C-19 | `SHOULD APPEND EVENT` |

建议新增事件事实：`旧泵房解密`，结果为“USB 完全解密、篡改者被识别、陈默向林夏披露身份、父亲线索指向北堤中转站”。

### 5. Ground Truth Hard State Delta

| Delta ID | 实体 | 属性 | Before | After | 判定 | 理由 |
|---|---|---|---|---|---|---|
| D17-01 | 林夏 | location | Maintenance Tunnel | Old Pump House | `SHOULD COMMIT STATE DELTA` | 她在旧泵房内操作电脑 |
| D17-02 | 陈默 | location | Maintenance Tunnel | Old Pump House | `SHOULD COMMIT STATE DELTA` | 他在泵房内关闭信号并出示证件 |
| D17-03 | 顾言 | location | Maintenance Tunnel | Old Pump House | `SHOULD COMMIT STATE DELTA` | 他在泵房内顶住门并核验证件 |
| D17-04 | 加密 USB | status | index_unlocked | decrypted | `SHOULD COMMIT STATE DELTA` | 全部目录内容已变为可读取 |
| D17-05 | USB Mystery | status | progressing | resolved | `SHOULD COMMIT STATE DELTA` | 实名人脸活体、指纹动态认证、不可远程的专属终端、摄像审计帧和唯一授权日志共同回答了实施者问题 |
| D17-06 | USB Mystery | resolution | unknown | 周启明本人实施货运记录篡改 | `SHOULD COMMIT STATE DELTA` | 组合证据排除仅凭 credential ownership 推定和一般 credential misuse |
| D17-07 | 林夏 → 陈默 | explicit interaction stance | no declared cooperation stance | bounded cooperation / declared trust for current escape | `SHOULD COMMIT STATE DELTA` | “这一次我信你。先带我们离开这里”是明确但有范围的合作与信任声明 |
| D17-08 | 林夏 → 陈默 | long-term trust state | distrust | distrust | 无变化 | 当前撤离中的明确合作立场不覆盖、不升级长期心理 trust |
| D17-09 | 父亲与残页命题 | Canonical World Truth | unresolved | confirmed_false | `SHOULD COMMIT STATE DELTA` | 录音、门禁和无剪辑影像共同确认父亲未在三天前到 C-19，残页由何叔代放 |
| D17-10 | 父亲的下落 | status | progressing | progressing | 无终态变化 | 新增北堤线索，但当前位置和安危仍未知 |
| D17-11 | 父亲的下落 | lead | C-19 | North Embankment Transfer Station | `SHOULD COMMIT STATE DELTA` | 最新录音给出转移目的地，但仅作为线索 |
| D17-12 | 加密 USB | owner / holder | 陈默 / 林夏 | 陈默 / 林夏 | 无变化 | 结尾林夏继续实际持有，没有所有权转让 |
| D17-13 | 货单残页 | owner / holder | unresolved / 林夏 | unresolved / 林夏 | 无变化 | 录音解释来源，但没有所有权转让证据 |

### 6. Knowledge Boundary Changes

| Knowledge ID | 主体 | 命题 | Before | After | 判定 |
|---|---|---|---|---|---|
| K17-01 | 林夏 | 陈默是市刑侦支队警察，正在港务安保中卧底 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-02 | 顾言 | 陈默的卧底目标是周启明 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-03 | 林夏 | 陈默的卧底目标是周启明 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-04 | 林夏、顾言、陈默 | 周启明本人通过实名动态认证、专属终端和唯一授权链执行删除、改号及日期回填 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-05 | 林夏、顾言、陈默 | 不存在的货船记录用于掩盖运往 C-19 的设备 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-06 | 林夏、顾言、陈默 | 林夏父亲在六月十七日录制音频时仍活着并即将被转移 | unaware | knows | `SHOULD COMMIT STATE DELTA` |
| K17-07 | 林夏、顾言、陈默 | 录音中的父亲声称自己当时将被送往北堤中转站 | unaware | know that father claimed P | `SHOULD COMMIT STATE DELTA`；不自动确认实际到达 |
| K17-08 | 林夏、顾言、陈默 | 父亲在六月二十日当前仍活着 | unaware | unaware | `SHOULD NOT COMMIT` |
| K17-09 | 林夏、顾言、陈默 | 父亲当前位于北堤中转站 | unaware | unaware | `SHOULD NOT COMMIT` |
| K17-10 | 林夏 | 父亲三天前亲自到 C-19 并留下残页 | believes(true) | corrected / knows(false) | `SHOULD COMMIT STATE DELTA`；录音、独立审计证据与林夏明确复述完成 belief correction |
| K17-11 | 林夏、顾言、陈默 | 父亲声称残页由他一个月前交给何叔，并由何叔放入 C-19 | unaware | know that father claimed P | `SHOULD COMMIT STATE DELTA` |
| K17-12 | 林夏、顾言、陈默 | 残页确由何叔放入 C-19，父亲未在三天前到场 | unknown | knows | `SHOULD COMMIT STATE DELTA`；门禁与无剪辑影像独立确认，录音提供一致来源说明 |

### 7. Soft Interpretation

| Interpretation ID | 候选解释 | 判定依据 |
|---|---|---|
| S17-01 | 周启明是父亲失踪案的最终主谋 | 他篡改记录且签署下一批货单，但“最终主谋”超出当前证据 |
| S17-02 | 陈默对林夏已完全坦白 | 他披露了身份和任务目标，不代表所有信息均已公开 |
| S17-03 | 林夏心理层面真正开始或全面信任陈默 | 正文只支持 explicit bounded cooperation / declared trust stance；长期内在信任不可直接观测 |
| S17-04 | 父亲三天前被成功送达北堤中转站 | 录音只表达预期去向，没有到达证据 |
| S17-05 | 门外的人已发现三人在泵房内 | 金属摩擦声表明外部活动，不证明对方已定位三人 |

以上均为 `SHOULD NOT COMMIT` 的硬状态候选。

### 8. Negative Delta

| Negative ID | 错误候选变化 | 判定 | 排除理由 |
|---|---|---|---|
| N17-01 | 父亲的下落 status = resolved | `SHOULD NOT COMMIT` | 录音距当前三天，当前地点与安危均未知 |
| N17-02 | 林夏父亲 current_location = North Embankment Transfer Station | `SHOULD NOT COMMIT` | 录音只说明预期转移目的地 |
| N17-03 | 林夏父亲 current_status = alive/safe | `SHOULD NOT COMMIT` | 只能证明三天前录音时存活 |
| N17-04 | 林夏心理上真正开始信任陈默，或长期 trust = full_trust | `SHOULD NOT COMMIT` | 明确语句只支持当前撤离中的 bounded cooperation / declared trust stance |
| N17-05 | 周启明 = 父亲失踪案最终主谋 | `SHOULD NOT COMMIT` | 已确认篡改货运记录，尚未确认全部犯罪层级 |
| N17-06 | 三人 location = Drainage Passage | `SHOULD NOT COMMIT` | 只是准备从排水通道撤离，尚未进入 |
| N17-07 | USB owner = 林夏或共同所有 | `SHOULD NOT COMMIT` | 林夏是 holder；没有所有权转让 |
| N17-08 | 仅因 `ZQ-MSA-01` 属于周启明就确认其本人操作 | `SHOULD NOT COMMIT` | 单独 credential ownership 仍存在 misuse 可能；本章必须依赖完整组合证据 |

### 9. Evidence

| Evidence ID | 原文证据 | 支持项 |
|---|---|---|
| EV17-01 | “旧泵房的铁门还能从里面插上”及三人在泵房内的连续动作 | D17-01、D17-02、D17-03 |
| EV17-02 | “六份货单、三段录音和权限日志全部变为可读取状态” | D17-04、E17-01 |
| EV17-03 | “每一次删除、改号和日期回填都来自同一台专属终端 `ZQ-OFFICE-01`……不接受远程登录” | E17-02、D17-05、D17-06 |
| EV17-04 | “同时通过周启明实名账户、现场人脸活体挑战和指纹动态认证” | E17-02、D17-05、D17-06、K17-04 |
| EV17-05 | “终端摄像审计帧还逐次显示周启明本人坐在屏幕前完成确认” | D17-05、D17-06、K17-04，并排除 N17-08 所示的单凭 credential ownership 归因 |
| EV17-06 | “唯一授权日志把这些操作绑定到只配发给他的密钥 `ZQ-MSA-01`” | 与 EV17-03 至 EV17-05 共同支持 D17-05、D17-06 |
| EV17-07 | “被篡改的记录把运往十九号冷库的设备改写成了不存在的货船” | K17-05 |
| EV17-08 | “市刑侦支队……我以码头联络人的身份进入港务安保” | E17-03、K17-01 |
| EV17-09 | “我在维修梯口看过，格式和防伪都对” | 支持林夏形成 K17-01 |
| EV17-10 | “这一次我信你。先带我们离开这里，别替我决定下一步” | D17-07，并限制 N17-04；不支持改变 D17-08 的 long-term trust state |
| EV17-11 | “我没有去过十九号冷库……残页……交给何叔……他会替我放进 C-19” | E17-08、K17-10、K17-11、K17-12 |
| EV17-12 | “三天前只有何叔刷证进入储物区，并把……残页放入柜内；父亲的身份记录、面部影像和同行痕迹均未出现” | E17-09、D17-09、K17-10、K17-12；独立于父亲陈述的 Canonical World Truth 证据 |
| EV17-13 | “所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的” | K17-10：`believes → corrected / knows false` |
| EV17-14 | “今天是六月十七日……他们会把我送去北堤中转站” | D17-11、K17-06、K17-07 |
| EV17-15 | “电脑右下角显示六月二十日凌晨” | 排除 N17-01、N17-02、N17-03 |
| EV17-16 | “准备继续撤离” | E17-07，并排除 N17-06 |

### 10. Expected State After Chapter

| 类别 | 实体 | 章后状态 |
|---|---|---|
| Character | 林夏 | `location = Old Pump House` |
| Character | 陈默 | `location = Old Pump House` |
| Character | 顾言 | `location = Old Pump House` |
| Item | 加密 USB | `owner = 陈默`；`holder = 林夏`；`status = decrypted` |
| Item | 货单残页 | `owner = unresolved`；`holder = 林夏`；密钥用途已验证 |
| Plot Thread | USB Mystery | `status = resolved`；篡改者为周启明，方式为其唯一授权密钥 |
| Plot Thread | 父亲的下落 | `status = progressing`；最新历史线索为北堤中转站；当前地点与安危未知 |
| Knowledge | 陈默的真实身份 | 陈默、顾言、林夏均知道 |
| Relationship | 林夏 → 陈默 | long-term trust state 保持 `distrust`；新增 `explicit bounded cooperation / declared trust for current escape`；两者是独立状态，当前话语不覆盖或升级长期心理 trust |
| Event | 旧泵房解密 | 已发生；三人仍在泵房内，准备继续撤离 |
| Belief | 父亲与残页 | Canonical World Truth：`unresolved → confirmed_false`；林夏：`believes(true) → corrected / knows(false)`；她知道父亲未在三天前亲自到 C-19，残页由何叔代放 |

---

## Pilot Coverage Matrix

| Coverage ID | 测试维度 | Ch13 | Ch14 | Ch15 | Ch16 | Ch17 | 预期判定重点 |
|---|---|---|---|---|---|---|---|
| COV-01 | 角色位置明确变化 | 林夏、陈默到 Hospital | 陈默 current location unresolved / unknown，last confirmed Hospital | 林夏、顾言到 C-19；陈默位置认知不变 | 三人到 Maintenance Tunnel | 三人到 Old Pump House | 只提交已抵达地点；目标地点和推定去向不提交 |
| COV-02 | 位置认知未决 |  | 陈默 current location unresolved / unknown | 继续 unresolved，last confirmed Hospital | 陈默被目击后 resolved at Maintenance Tunnel | resolved at Old Pump House | “离开 A”不等于“到达 B”；unknown 是 epistemic state，不是地点值 |
| COV-03 | Item owner vs holder | USB holder 陈默 → 林夏；owner 不变 | holder 不变 | 新增残页：owner unresolved，holder 林夏 | 两件物品 holder 不变 | 两件物品 holder 不变 | 设备使用、触碰、封装和保管不自动改变 owner |
| COV-04 | 道具分阶段状态 | encrypted | index_unlocked | 保持 index_unlocked | 保持 index_unlocked | decrypted | 区分目录解锁、疑似获得密钥与完成解密 |
| COV-05 | 新 Item 创建 |  |  | 货单残页 |  |  | 新道具需有直接发现证据、来源和当前保管者 |
| COV-06 | Event vs State Effect | 急诊室的交接；状态效果为位置、holder、线索推进 | 医院内的索引解锁；状态效果为位置认知和 USB 状态 | C-19 搜索；状态效果为位置、新 Item 与 holder | C-19 撤离；状态效果为位置和 Knowledge | 旧泵房解密；状态效果为解密、线索解决和明确合作立场 | Event 只进入 Ground Truth Events；Current State Effect 才进入 Hard State Delta |
| COV-07 | Plot Thread 推进 | USB Mystery open → progressing | 父亲下落 open → progressing | 两条线保持 progressing | 两条线保持 progressing | USB Mystery resolved；父亲线仍 progressing | “获得线索”与“问题解决”严格分离 |
| COV-08 | 明确问题的 Resolution |  |  |  |  | 周启明使用唯一授权密钥篡改记录 | 只有证据直接回答原问题时才 resolved |
| COV-09 | 角色怀疑与知识分离 | 林夏仅怀疑陈默公开身份不完整 | 怀疑不升级 | 怀疑不升级 | 林夏仍不知，顾言已知 | 林夏经直接披露后知道 | `suspects` 不得归一化为 `knows` |
| COV-10 | 非对称 Knowledge | 陈默独知正式命题 P | 维持 | 维持 | 对同一 P：顾言 `unaware → knows`；林夏保持 `unaware` | 林夏经直接披露后知道 P | 同一正式 World/Character proposition 必须按角色分别更新 |
| COV-11 | Reported Proposition |  | 林夏、顾言知道“何叔声称父亲委托他” | 顾言知道“林夏声称标记属于父亲” |  | 三人知道“父亲声称将被送往北堤” | 用“角色知道某人声称 P”表达；不把 P 自动变为角色已确认事实 |
| COV-12 | 身份明确披露 |  |  |  | 陈默直接披露 P，顾言结合 credential inspection 后知道 P；林夏未接收披露 | 向林夏直接披露 P | Reported Proposition 可记录“陈默声称 P”，但不能代替 `CharacterKnowledge[顾言, P]`；空间、在场性和证据 provenance 决定 knowledge scope |
| COV-13 | Relationship 双层状态 | long-term trust 不变 | long-term trust 不变 | 明确保留判断 | long-term trust 仍为 distrust | 新增 explicit bounded cooperation / declared trust for current escape；long-term trust 仍为 distrust | 明确话语只新增有界合作立场；不覆盖或升级长期心理 trust |
| COV-14 | Soft Interpretation | 受伤原因、陈默动机 | 何叔可信度、离院动机 | 标记作者、短信动机 | 隐瞒动机、入侵者身份 | 最终主谋、完全坦白 | 可供审核，不写入 Hard State |
| COV-15 | Negative Delta | 身份误揭露、误解密 | 目录解锁误判完整解密 | 疑似密钥误判已解密 | 林夏隔墙“自动知情” | 历史录音误判当前存活 | 每章至少一个高风险误提交样例 |
| COV-16 | 时间边界 |  | 转达时间未知 | 货单日期不等于人在场时间 |  | 三天前存活不等于当前存活 | 历史事实不得覆盖当前状态 |
| COV-17 | 未来动作边界 |  |  | 开始撤离但未完成远端到达 | “向旧泵房方向”不等于已抵达 | “准备进入排水通道”不等于已进入 | 意图、方向和准备动作均不提交为完成状态 |
| COV-18 | 消息发送者验证 |  |  | 仅知来自陈默号码 | 陈默本人承认发送 |  | 号码归属与实际发送者分阶段确认 |
| COV-19 | 否定事实保留 | USB 未解密 | 主体文件仍锁定 | 林夏明确未决定信任 | 顾言没有转述 | 录音不能证明当前平安 | 否定句和限制语必须参与 Delta 决策 |
| COV-20 | Evidence 可定位性 | 交接动作原句 | 解锁层级原句 | 道具发现与保管原句 | 空间隔离与身份披露原句 | 日志、证件、时间戳原句 | 每条关键 Delta 可回指正文最小证据片段 |
| COV-21 | False Belief |  |  | Canonical World Truth = unresolved；林夏 = believes(true)；hidden_author_truth = false | Canonical unresolved；belief 保持 | Canonical confirmed_false；belief 被直接证据否定 | hidden_author_truth 不得作为 Chapter 15 Canonical State 输入 |
| COV-22 | Belief Correction |  |  | 林夏 `no belief → believes(true)` | believes(true) 保持 | World Truth `unresolved → confirmed_false`；林夏 `believes(true) → corrected / knows(false)` | Canonical Truth 与角色 belief 分轨更新；纠正需要新证据和角色明确改判 |
| COV-23 | Unknown Epistemic State |  | 陈默 current location unresolved / unknown；last confirmed Hospital | 继续 unresolved | 被目击后 resolved at Maintenance Tunnel | resolved at Old Pump House | unknown 是对当前知识状态的描述，不是普通 location domain value |
| COV-24 | Credential Misuse 排除 |  |  |  |  | 实名活体 + 指纹动态认证 + 不可远程专属终端 + 摄像审计帧 + 唯一授权日志 | credential belongs to X 单独不足；组合证据才支持 X 本人实施 |

## Pilot 终态摘要

| 类别 | Pilot 结束状态 |
|---|---|
| Characters | 林夏、陈默、顾言均位于 Old Pump House |
| Knowledge Boundary | 三人均知道陈默的卧底身份；三人均知道周启明篡改记录；无人能确认父亲当前地点或安危 |
| Relationships | 林夏 → 陈默的 long-term trust state 保持 `distrust`；另新增当前撤离范围内的 explicit bounded cooperation / declared trust stance |
| Items | USB `owner = 陈默`、`holder = 林夏` 且已解密；货单残页 `owner = unresolved`、`holder = 林夏` 且密钥用途已验证 |
| Plot Threads | USB Mystery 已解决；父亲的下落仍在推进，最新历史线索为北堤中转站 |
| Events | 五章各形成可追加事件；移动计划和未来动作均未提前写成已完成事件 |
| Commit Boundary | 直接动作、明确陈述、可定位证据进入 Hard State；怀疑、动机、历史到当前的跨时推断和未完成计划保持在 Soft Interpretation 或 Negative Delta |

## V0.2.1 → V0.2.2 CHANGELOG

| Change ID | 修订 |
|---|---|
| FIX-01 | 统一 Chapter 16 身份命题 P：顾言基于陈默直接披露与 credential inspection 完成 `unaware → knows`；林夏对 P 保持 `unaware`，并将其对“公开身份不完整”的 `suspects` 作为独立命题保留；同步校正 Expected State、COV-10、COV-12 与 Evidence provenance |
