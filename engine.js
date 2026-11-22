/**
 * ScholaraPuppy — Shared Core Scoring, Highlighting & 3-Tier Rewrite Engine (engine.js)
 * Pure static JS (no ES Modules / no bundler). Works directly via file:// or GitHub Pages.
 * Expects window.SCHOLARA_RULES (or window.APP_RULES) to be loaded first.
 */
(function (global) {
    'use strict';

    const RULES = global.SCHOLARA_RULES || global.APP_RULES;
    if (!RULES) {
        console.error('[ScholaraPuppy] Rules file not loaded. Include rules-en.js or rules-zh.js before engine.js.');
        return;
    }
    // Keep alias for compatibility with window.APP_RULES
    if (!global.APP_RULES) {
        global.APP_RULES = RULES;
    }

    const IS_ZH = RULES.lang === 'zh';
    const ZH_SCRIPT_KEY = 'scholara_puppy_zh_script_v1';

    // =========================================================================
    // RUNTIME STATE
    // =========================================================================
    let zhScript = 'tw'; // 'tw' (繁體) | 'cn' (簡體) — only active when IS_ZH is true
    let recentMemory = [];
    let currentPassage = '';
    let detectedIssues = [];
    let activeIssueIndex = 0;
    let lastAnalysis = null;
    let undoStack = [];

    // =========================================================================
    // UI COPY DICTIONARY (EN / 繁體中文 / 簡體中文)
    // =========================================================================
    const UI_COPY = {
        en: {
            paraUnit: (n) => `${n} para${n === 1 ? '' : 's'}`,
            sentUnit: (n) => `${n} sentence${n === 1 ? '' : 's'}`,
            wordUnit: (n) => `${n} word${n === 1 ? '' : 's'}`,
            emptyMemory: 'No saved scans yet — paste your text below and click Scan Text.',
            scanning: 'Scanning...',
            scanBtn: 'Scan Text',
            toastEmpty: 'Please paste a passage first.',
            toastCleared: 'Cleared editor text.',
            toastMemoryCleared: 'Cleared recent scan history.',
            toastCopied: 'Copied passage to clipboard.',
            toastCopyFail: 'Copy failed — please select and copy manually.',
            toastScanDone: (score) => `Scan complete: ${score}% AI Score`,
            toastScanErr: 'An error occurred while scanning. Please try again.',
            toastFixApplied: 'Applied meaning-preserving fix and updated score.',
            toastAllApplied: (n) => `Applied ${n} safe fix${n === 1 ? '' : 'es'} and updated score.`,
            toastNoAutoFix: 'No auto-fixable Tier 1/2 issues left — review Tier 3 items in editor.',
            toastUndo: 'Restored previous text.',
            toastFocused: 'Jumped to this passage in the editor for quick revision.',
            verdictReady: 'Ready to Scan',
            verdictHigh: 'High AI Probability',
            verdictMid: 'Mixed / Moderate Signal',
            verdictLow: 'Human Writing Style',
            whitelistPrefix: (n, list, more) => `Protected ${n} STEM term${n === 1 ? '' : 's'} from predictability penalties (${list}${more}).`,
            cleanBanner: 'No high-risk AI phrases or robotic structural patterns were flagged in your passage.',
            inspectorEmpty: 'Paste your text on the left and click Scan Text to inspect issues and apply meaning-preserving fixes.',
            inspectorClean: 'Your passage looks clean! No AI phrases or structural issues need attention.',
            tierLabels: {
                1: 'Layer 1 · Clause / Word Rewrite',
                2: 'Layer 2 · Flow / Structure Split',
                3: 'Layer 3 · Manual Review'
            },
            dimLabels: {
                authenticity: 'Authenticity',
                density: 'Density',
                directness: 'Directness',
                trust: 'Trust'
            },
            labelOriginal: 'Flagged Text',
            labelReason: 'Why This Raises AI Score',
            labelRewrite: 'Meaning-Preserving Rewrite',
            labelGuidance: 'How to Revise Manually',
            btnApplyFix: 'Apply Fix',
            btnFocusEditor: 'Focus in Editor',
            btnUndo: 'Undo Last Fix',
            btnApplyAll: (n) => `Apply All Safe Fixes (${n})`,
            pillarNames: {
                p1: 'Sentence Flow',
                p2: 'AI Phrases',
                p3: 'Predictability',
                p4: 'Structure',
                p5: 'Grammar'
            },
            pillarToggleShow: 'Show 5-Pillar Breakdown',
            pillarToggleHide: 'Hide 5-Pillar Breakdown',
            pillarTips: {
                p1: (sd, mean) => `Sentence length SD: ${sd} | Mean: ${mean} words`,
                p2: (hits) => `${hits} phrase/syntax hit${hits === 1 ? '' : 's'} detected`,
                p3: (stem, ttr) => `${stem} STEM term${stem === 1 ? '' : 's'} protected | Lexical TTR: ${ttr}`,
                p4: (cv, paras) => `Paragraph length CV: ${cv} | ${paras} paragraph${paras === 1 ? '' : 's'}`,
                p5: (grade, errs, src) => `${grade} | ${errs} grammar quirk${errs === 1 ? '' : 's'} (${src})`
            },
            pillarIdleTip: 'Run a scan to view mathematical metrics',
            flowIssueName: 'Uniform / Long Sentence Flow',
            flowIssueReason: 'This sentence is long or closely matches neighboring sentence lengths, flattening rhythm (Sentence Flow).',
            paraSplitName: 'Symmetric Paragraph Structure',
            paraSplitReason: 'Your paragraphs have overly uniform lengths; splitting at this logical transition adds natural structural variation.',
            paraSplitPreview: '(Insert a paragraph break right before this transition sentence — 100% original wording kept)',
            openerIssueName: 'Repetitive Sentence Openers (3 in a Row)',
            openerIssueReason: (opener) => `Three consecutive sentences start with "${opener}". Repetitive opening syntax is a strong AI cadence signal.`,
            openerIssueGuidance: 'Rewrite this sentence to open with a specific actor, timeframe, contrast clause, or concrete metric instead.',
            glueIssueName: 'High Abstract Nominalization Density',
            glueIssueReason: (noms) => `Even after protecting STEM terms, this sentence clusters abstract nouns (${noms}) without concrete empirical anchors.`,
            glueIssueGuidance: 'Convert abstract "-tion/-ment" nouns into active verbs with human actors or add a specific measurement/citation.',
            testInScanner: 'Test Human Passage in Scanner'
        },
        tw: {
            paraUnit: (n) => `${n} 段`,
            sentUnit: (n) => `${n} 句`,
            wordUnit: (n) => `${n} 字`,
            emptyMemory: '尚無掃描紀錄 — 請在下方貼上文章並點擊「掃描文本」。',
            scanning: '掃描中...',
            scanBtn: '掃描文本',
            toastEmpty: '請先貼上要檢測的文章！',
            toastCleared: '已清空編輯器文字。',
            toastMemoryCleared: '已清除最近 5 次掃描紀錄。',
            toastCopied: '已複製文章內容。',
            toastCopyFail: '複製失敗，請手動選取文字複製。',
            toastScanDone: (score) => `掃描完成：AI 綜合機率 ${score}%`,
            toastScanErr: '掃描時發生錯誤，請稍後再試。',
            toastFixApplied: '已套用保原意改寫並重新計算分數！',
            toastAllApplied: (n) => `已一鍵套用 ${n} 項安全改寫並刷新分數！`,
            toastNoAutoFix: '目前無可自動改寫的項目，請查看層級 3 手動微調建議。',
            toastUndo: '已復原至上一步原文。',
            toastFocused: '已跳轉並選取原文該句，方便您直接微調。',
            verdictReady: '準備掃描',
            verdictHigh: '高 AI 機率',
            verdictMid: '中度／混合訊號',
            verdictLow: '自然人類寫作',
            whitelistPrefix: (n, list, more) => `已保護 ${n} 個科學／專業術語免受預測度誤判（${list}${more}）。`,
            cleanBanner: '表現很棒！文章中未偵測到高風險 AI 套話或機械化結構。',
            inspectorEmpty: '請先於左側貼上文章並點擊「掃描文本」，再點選高亮文字檢視問題與保原意改寫。',
            inspectorClean: '目前未偵測到明顯 AI 腔或結構問題，文風相當自然！',
            tierLabels: {
                1: '層級 1 · 詞句骨架重組',
                2: '層級 2 · 節奏與拆段優化',
                3: '層級 3 · 人工微調指引'
            },
            dimLabels: {
                authenticity: '真實度',
                density: '資訊密度',
                directness: '直接度',
                trust: '可信度'
            },
            labelOriginal: '標記原文',
            labelReason: '為何拉高 AI 率',
            labelRewrite: '保原意建議改寫',
            labelGuidance: '建議修改方向',
            btnApplyFix: 'Apply Fix 套用改寫',
            btnFocusEditor: '聚焦原文微調',
            btnUndo: '復原上次改寫',
            btnApplyAll: (n) => `一鍵套用全部安全改寫 (${n})`,
            pillarNames: {
                p1: '句長節奏',
                p2: 'AI 慣用語',
                p3: '用詞預測度',
                p4: '段落結構',
                p5: '語法工整度'
            },
            pillarToggleShow: '展開 5 項數學指標',
            pillarToggleHide: '收合 5 項數學指標',
            pillarTips: {
                p1: (sd, mean) => `句長標準差 SD: ${sd}｜平均句長: ${mean} 單位`,
                p2: (hits) => `命中 ${hits} 處 AI 慣用語／句型規則`,
                p3: (stem, ttr) => `保護 ${stem} 個 STEM 術語｜詞彙多樣度: ${ttr}`,
                p4: (cv, paras) => `段落變異係數 CV: ${cv}｜共 ${paras} 段`,
                p5: (grade, errs, src) => `${grade}｜偵測 ${errs} 處自然瑕疵 (${src})`
            },
            pillarIdleTip: '掃描後懸停可檢視底層數學參數',
            flowIssueName: '長句或句長過於均勻',
            flowIssueReason: '此句偏長或與前後句長度過於接近，導致節奏過於工整而拉高 AI 率。',
            paraSplitName: '段落長度過於對稱',
            paraSplitReason: '各段字數分布過於平均，建議在此邏輯轉折句前拆成新段以增加自然節奏。',
            paraSplitPreview: '（於此轉折句前插入換段，100% 保留原有文字不刪改）',
            openerIssueName: '連續三句開頭結構雷同',
            openerIssueReason: (opener) => `連續三句皆以「${opener}」起頭，重複的起手式容易被判讀為機器模板。`,
            openerIssueGuidance: '建議將此句改為由具體主詞、時間點、數據或轉折子句開頭。',
            glueIssueName: '抽象名詞與報告套語偏密',
            glueIssueReason: (noms) => `排除 STEM 專業術語後，此句仍密集使用空泛抽象詞（${noms}）且缺乏實證錨點。`,
            glueIssueGuidance: '建議將抽象名詞改寫為具體動詞，並補上年份、樣本數或具體主體。',
            testInScanner: '載入此人類範例測試'
        },
        cn: {
            paraUnit: (n) => `${n} 段`,
            sentUnit: (n) => `${n} 句`,
            wordUnit: (n) => `${n} 字`,
            emptyMemory: '暂无扫描记录 — 请在下方粘贴文章并点击「扫描文本」。',
            scanning: '扫描中...',
            scanBtn: '扫描文本',
            toastEmpty: '请先粘贴要检测的文章！',
            toastCleared: '已清空编辑器文字。',
            toastMemoryCleared: '已清除最近 5 次扫描记录。',
            toastCopied: '已复制文章内容。',
            toastCopyFail: '复制失败，请手动选取文字复制。',
            toastScanDone: (score) => `扫描完成：AI 综合概率 ${score}%`,
            toastScanErr: '扫描时发生错误，请稍后再试。',
            toastFixApplied: '已应用保原意改写并重新计算分数！',
            toastAllApplied: (n) => `已一键应用 ${n} 项安全改写并刷新分数！`,
            toastNoAutoFix: '当前无可自动改写的项目，请查看层级 3 手动微调建议。',
            toastUndo: '已撤销至上一步原文。',
            toastFocused: '已跳转并选中原文该句，方便您直接微调。',
            verdictReady: '准备扫描',
            verdictHigh: '高 AI 概率',
            verdictMid: '中度／混合信号',
            verdictLow: '自然人类写作',
            whitelistPrefix: (n, list, more) => `已保护 ${n} 个科学／专业术语免受预测度误判（${list}${more}）。`,
            cleanBanner: '表现很棒！文章中未检测到高风险 AI 套话或机械化结构。',
            inspectorEmpty: '请先在左侧粘贴文章并点击「扫描文本」，再点击高亮文字查看问题与保原意改写。',
            inspectorClean: '当前未检测到明显 AI 腔或结构问题，文风相当自然！',
            tierLabels: {
                1: '层级 1 · 词句骨架重组',
                2: '层级 2 · 节奏与拆段优化',
                3: '层级 3 · 人工微调指引'
            },
            dimLabels: {
                authenticity: '真实度',
                density: '信息密度',
                directness: '直接度',
                trust: '可信度'
            },
            labelOriginal: '标记原文',
            labelReason: '为何拉高 AI 率',
            labelRewrite: '保原意建议改写',
            labelGuidance: '建议修改方向',
            btnApplyFix: 'Apply Fix 应用改写',
            btnFocusEditor: '聚焦原文微调',
            btnUndo: '撤销上次改写',
            btnApplyAll: (n) => `一键应用全部安全改写 (${n})`,
            pillarNames: {
                p1: '句长节奏',
                p2: 'AI 惯用语',
                p3: '用词预测度',
                p4: '段落结构',
                p5: '语法工整度'
            },
            pillarToggleShow: '展开 5 项数学指标',
            pillarToggleHide: '收起 5 项数学指标',
            pillarTips: {
                p1: (sd, mean) => `句长标准差 SD: ${sd}｜平均句长: ${mean} 单位`,
                p2: (hits) => `命中 ${hits} 处 AI 惯用语／句型规则`,
                p3: (stem, ttr) => `保护 ${stem} 个 STEM 术语｜词汇多样度: ${ttr}`,
                p4: (cv, paras) => `段落变异系数 CV: ${cv}｜共 ${paras} 段`,
                p5: (grade, errs, src) => `${grade}｜检测 ${errs} 处自然瑕疵 (${src})`
            },
            pillarIdleTip: '扫描后悬停可查看底层数学参数',
            flowIssueName: '长句或句长过于均匀',
            flowIssueReason: '此句偏长或与前后句长度过于接近，导致节奏过于工整而拉高 AI 率。',
            paraSplitName: '段落长度过于对称',
            paraSplitReason: '各段字数分布过于平均，建议在此逻辑转折句前拆成新段以增加自然节奏。',
            paraSplitPreview: '（在此转折句前插入换段，100% 保留原有文字不删改）',
            openerIssueName: '连续三句开头结构雷同',
            openerIssueReason: (opener) => `连续三句皆以「${opener}」起头，重复的起手式容易被判读为机器模板。`,
            openerIssueGuidance: '建议将此句改为由具体主语、时间点、数据或转折分句开头。',
            glueIssueName: '抽象名词与报告套语偏密',
            glueIssueReason: (noms) => `排除 STEM 专业术语后，此句仍密集使用空泛抽象词（${noms}）且缺乏实证锚点。`,
            glueIssueGuidance: '建议将抽象名词改写为具体动词，并补上年份、样本量或具体主体。',
            testInScanner: '载入此人类范例测试'
        }
    };

    function t() {
        if (!IS_ZH) return UI_COPY.en;
        return zhScript === 'cn' ? UI_COPY.cn : UI_COPY.tw;
    }

    function pickRuleText(obj, field) {
        if (!obj) return '';
        if (IS_ZH && zhScript === 'cn' && obj[field + 'CN']) {
            return obj[field + 'CN'];
        }
        return obj[field] || '';
    }

    // =========================================================================
    // INITIALIZATION & ZH SCRIPT SWITCHER (繁 / 簡)
    // =========================================================================
    function init() {
        if (IS_ZH) {
            try {
                const savedScript = localStorage.getItem(ZH_SCRIPT_KEY);
                if (savedScript === 'cn' || savedScript === 'tw') {
                    zhScript = savedScript;
                }
            } catch (e) {}
            applyZhScriptToDom();
        }

        loadMemory();
        renderSampleButtons();
        renderReferenceBenchmarks();
        resetPillarBars();

        const inputEl = document.getElementById('passageInput');
        if (inputEl) {
            inputEl.addEventListener('input', updateWordCount);
            inputEl.focus();
        }
        updateWordCount();
        renderInspector();
    }

    function setZhScript(script) {
        if (!IS_ZH) return;
        zhScript = script === 'cn' ? 'cn' : 'tw';
        try {
            localStorage.setItem(ZH_SCRIPT_KEY, zhScript);
        } catch (e) {}

        applyZhScriptToDom();
        renderSampleButtons();
        renderMemoryBar();
        renderReferenceBenchmarks();
        updateWordCount();

        if (lastAnalysis) {
            updateScoreUI(lastAnalysis.overallScore);
            updatePillarBreakdownUI(lastAnalysis);
            renderWhitelistBanner(lastAnalysis.whitelistedTerms);
            renderAnnotatedText();
            renderInspector();
        } else {
            updateScoreUI(0);
            resetPillarBars();
            renderInspector();
        }
    }

    function applyZhScriptToDom() {
        if (!IS_ZH) return;
        document.documentElement.lang = zhScript === 'cn' ? 'zh-Hans' : 'zh-Hant';

        document.querySelectorAll('[data-tw][data-cn]').forEach((el) => {
            el.textContent = zhScript === 'cn' ? el.getAttribute('data-cn') : el.getAttribute('data-tw');
        });
        document.querySelectorAll('[data-placeholder-tw][data-placeholder-cn]').forEach((el) => {
            el.setAttribute('placeholder', zhScript === 'cn' ? el.getAttribute('data-placeholder-cn') : el.getAttribute('data-placeholder-tw'));
        });
        document.querySelectorAll('[data-title-tw][data-title-cn]').forEach((el) => {
            el.setAttribute('title', zhScript === 'cn' ? el.getAttribute('data-title-cn') : el.getAttribute('data-title-tw'));
        });

        const btnTw = document.getElementById('zhBtnTw');
        const btnCn = document.getElementById('zhBtnCn');
        if (btnTw && btnCn) {
            btnTw.classList.toggle('is-active', zhScript === 'tw');
            btnCn.classList.toggle('is-active', zhScript === 'cn');
        }

        // Sync collapsible 5-pillar toggle label
        const toggleBtn = document.getElementById('pillarToggleBtn');
        const toggleText = document.getElementById('pillarToggleText');
        if (toggleBtn && toggleText) {
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            toggleText.textContent = expanded ? t().pillarToggleHide : t().pillarToggleShow;
        }
    }

    // =========================================================================
    // SENTENCE SPLITTING WITH EXACT OFFSETS (DECIMALS & ABBREVIATIONS SAFE)
    // =========================================================================
    function splitIntoSentencesWithOffsets(text) {
        if (!text || !text.trim()) return [];
        const results = [];
        const len = text.length;
        let segStart = 0;

        while (segStart < len && /\s/.test(text[segStart])) segStart++;

        const abbrevRegex = /\b(?:et\s+al|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|Prof|Fig|Eq|No|Vol|pp|p|St|Jr|Sr|Inc|Ltd|U\.S|U\.K)$/i;

        for (let i = segStart; i < len; i++) {
            const ch = text[i];
            let isEnd = false;

            if (ch === '\n') {
                isEnd = true;
            } else if (ch === '。' || ch === '！' || ch === '？') {
                isEnd = true;
            } else if (ch === '.' || ch === '!' || ch === '?') {
                const next = text[i + 1] || '';
                const prev = text[i - 1] || '';
                if (ch === '.' && /\d/.test(prev) && /\d/.test(next)) {
                    isEnd = false;
                } else if (ch === '.' && abbrevRegex.test(text.slice(Math.max(segStart, i - 10), i))) {
                    isEnd = false;
                } else if (next === '' || /[\s"'”’)\]]/.test(next)) {
                    isEnd = true;
                }
            }

            if (isEnd) {
                let segEnd = ch === '\n' ? i : i + 1;
                while (segEnd < len && /[.!?。！？"'”’」』)\]]/.test(text[segEnd]) && text[segEnd] !== '\n') {
                    segEnd++;
                }
                const rawSlice = text.slice(segStart, segEnd);
                const trimmed = rawSlice.trim();
                if (trimmed.length > 0) {
                    const leadWs = rawSlice.indexOf(trimmed);
                    results.push({
                        text: trimmed,
                        start: segStart + leadWs,
                        end: segStart + leadWs + trimmed.length
                    });
                }
                i = segEnd - 1;
                segStart = segEnd;
                while (segStart < len && /\s/.test(text[segStart])) segStart++;
                if (segStart > i + 1) i = segStart - 1;
            }
        }

        if (segStart < len) {
            const rawSlice = text.slice(segStart);
            const trimmed = rawSlice.trim();
            if (trimmed.length > 0) {
                const leadWs = rawSlice.indexOf(trimmed);
                results.push({
                    text: trimmed,
                    start: segStart + leadWs,
                    end: segStart + leadWs + trimmed.length
                });
            }
        }

        return results;
    }

    function countSemanticUnits(str) {
        const cjk = (str.match(/[\u4e00-\u9fff]/g) || []).length;
        const en = (str.match(/\b[a-zA-Z0-9]+(?:[-'][a-zA-Z0-9]+)*\b/g) || []).length;
        if (IS_ZH) {
            return Math.round((cjk / 1.7) + en);
        }
        return en + Math.round(cjk / 1.7);
    }

    function updateWordCount() {
        const text = (document.getElementById('passageInput')?.value || '').trim();
        const paras = text ? text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
        const sentences = splitIntoSentencesWithOffsets(text);
        const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const enWords = (text.match(/\b[a-zA-Z0-9]+(?:[-'][a-zA-Z0-9]+)*\b/g) || []).length;

        const paraEl = document.getElementById('paraCountBadge');
        const sentEl = document.getElementById('sentenceCountBadge');
        const wordEl = document.getElementById('wordCountBadge');
        const copy = t();

        if (paraEl) paraEl.textContent = copy.paraUnit(paras.length);
        if (sentEl) sentEl.textContent = copy.sentUnit(sentences.length);
        if (wordEl) {
            const count = IS_ZH ? (cjkChars > 0 ? cjkChars : enWords) : (enWords + Math.round(cjkChars / 1.7));
            wordEl.textContent = copy.wordUnit(count);
        }
    }

    // =========================================================================
    // SAMPLE LOADER & REFERENCE BENCHMARKS
    // =========================================================================
    function renderSampleButtons() {
        const container = document.getElementById('sampleButtonsContainer');
        if (!container || !RULES.samples) return;

        const keys = Object.keys(RULES.samples);
        container.innerHTML = keys.map((key) => {
            const s = RULES.samples[key];
            const label = pickRuleText(s, 'label');
            const iconColor = key === 'sciLab' ? 'text-[#2d7a5b]' : 'text-cute-pink';
            return `
                <button type="button" onclick="loadSampleByKey('${escapeJsString(key)}')" class="sample-pill-btn">
                    <i class="ph-bold ${s.icon || 'ph-file-text'} ${iconColor}"></i>
                    <span>${escapeHtml(label)}</span>
                </button>
            `;
        }).join('');
    }

    function loadSampleByKey(key) {
        const sample = RULES.samples && RULES.samples[key];
        if (!sample) return;
        const text = pickRuleText(sample, 'text');
        const inputEl = document.getElementById('passageInput');
        if (inputEl) {
            inputEl.value = text;
            updateWordCount();
            runManualScan(true);
        }
    }

    function renderReferenceBenchmarks() {
        const grid = document.getElementById('referenceBenchmarksGrid');
        if (!grid || !RULES.referenceBenchmarks) return;
        const copy = t();

        grid.innerHTML = RULES.referenceBenchmarks.map((b) => {
            const discipline = pickRuleText(b, 'discipline');
            const aiScoreLabel = pickRuleText(b, 'aiScoreLabel');
            const aiDraft = pickRuleText(b, 'aiDraft');
            const humanScoreLabel = pickRuleText(b, 'humanScoreLabel');
            const humanExcerpt = pickRuleText(b, 'humanExcerpt');
            const testText = pickRuleText(b, 'testText');

            return `
                <div class="p-4 rounded-xl border border-cute-blushBorder bg-[#fffdf9] flex flex-col justify-between space-y-3">
                    <div class="space-y-2">
                        <span class="px-2.5 py-0.5 rounded-full bg-cute-cream border border-cute-creamBorder font-bold text-[10px] text-cute-cocoa uppercase">${escapeHtml(discipline)}</span>
                        <div class="p-2.5 rounded-lg bg-[#f9dfe4]/60 border border-cute-blushBorder">
                            <span class="font-bold text-cute-pink block text-[10px] uppercase">${escapeHtml(aiScoreLabel)}</span>
                            <p class="font-serif italic mt-1">"${escapeHtml(aiDraft)}"</p>
                        </div>
                        <div class="p-2.5 rounded-lg bg-[#e8f6ef] border border-[#bde0ce]">
                            <span class="font-bold text-[#256346] block text-[10px] uppercase">${escapeHtml(humanScoreLabel)}</span>
                            <p class="font-serif mt-1">"${escapeHtml(humanExcerpt)}"</p>
                        </div>
                    </div>
                    <button type="button" onclick="loadBenchmarkIntoScanner('${escapeJsString(testText)}')" class="w-full py-1.5 rounded-lg bg-cute-blush hover:bg-cute-pink hover:text-white font-bold text-cute-cocoa transition">
                        ${escapeHtml(copy.testInScanner)}
                    </button>
                </div>
            `;
        }).join('');
    }

    // =========================================================================
    // RECENT 5 SCANS MEMORY (ISOLATED PER LANGUAGE VIA RULES.storageKey)
    // =========================================================================
    function loadMemory() {
        try {
            const saved = localStorage.getItem(RULES.storageKey);
            if (saved) recentMemory = JSON.parse(saved).slice(0, 5);
        } catch (e) {
            recentMemory = [];
        }
        renderMemoryBar();
    }

    function saveToMemory(text, score) {
        const clean = text.trim();
        if (!clean) return;
        recentMemory = recentMemory.filter((item) => item.text !== clean);
        const snippet = clean.replace(/\s+/g, ' ').slice(0, 24);
        recentMemory.unshift({
            text: clean,
            label: clean.length > 24 ? snippet + '...' : snippet,
            score: score
        });
        recentMemory = recentMemory.slice(0, 5);
        try {
            localStorage.setItem(RULES.storageKey, JSON.stringify(recentMemory));
        } catch (e) {}
        renderMemoryBar();
    }

    function renderMemoryBar() {
        const bar = document.getElementById('recentHistoryBar');
        if (!bar) return;
        if (recentMemory.length === 0) {
            bar.innerHTML = `<span class="text-xs text-cute-cocoa/60 italic px-2">${escapeHtml(t().emptyMemory)}</span>`;
            return;
        }
        bar.innerHTML = recentMemory.map((item, idx) => `
            <div class="inline-flex items-center bg-cute-cream hover:bg-cute-yellowSoft border border-cute-creamBorder rounded-xl px-2.5 py-1 transition gap-1.5 shrink-0">
                <button type="button" onclick="loadFromMemory(${idx})" class="flex items-center gap-1.5 text-left text-xs font-bold text-cute-cocoa truncate max-w-[160px]" title="${escapeHtml(item.label)}">
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-cute-pink text-white">${item.score}%</span>
                    <span class="truncate">${escapeHtml(item.label)}</span>
                </button>
                <button type="button" onclick="deleteMemoryItem(${idx})" class="text-cute-cocoa/40 hover:text-cute-pink pl-1" aria-label="Remove">
                    <i class="ph-bold ph-x text-[10px]"></i>
                </button>
            </div>
        `).join('');
    }

    function loadFromMemory(idx) {
        if (!recentMemory[idx]) return;
        const inputEl = document.getElementById('passageInput');
        if (inputEl) {
            inputEl.value = recentMemory[idx].text;
            updateWordCount();
            runManualScan(false);
        }
    }

    function deleteMemoryItem(idx) {
        recentMemory.splice(idx, 1);
        try {
            localStorage.setItem(RULES.storageKey, JSON.stringify(recentMemory));
        } catch (e) {}
        renderMemoryBar();
    }

    function clearAllMemory() {
        recentMemory = [];
        try {
            localStorage.removeItem(RULES.storageKey);
        } catch (e) {}
        renderMemoryBar();
        showToast(t().toastMemoryCleared);
    }

    // =========================================================================
    // 5-PILLAR MATHEMATICAL + 3-TIER ZERO-COST REWRITE ANALYSIS ENGINE
    // =========================================================================

    // Pillar 1: Sentence Flow (Burstiness / Length SD)
    function calculateBurstinessMetrics(sentences) {
        if (sentences.length < 2) {
            return { stdDev: '—', mean: '—', rawSd: 99, rawMean: 0, lengths: [], subScore: 22 };
        }

        const lengths = sentences.map((s) => countSemanticUnits(s.text)).filter((n) => n > 0);
        if (lengths.length < 2) {
            return { stdDev: '—', mean: '—', rawSd: 99, rawMean: 0, lengths: [], subScore: 22 };
        }

        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
        const sd = Math.sqrt(variance);

        let subScore = 15;
        if (sd < 3.0) subScore = 92;
        else if (sd < 4.5) subScore = 76;
        else if (sd < 6.0) subScore = 54;
        else if (sd < 7.8) subScore = 30;
        else subScore = 12;

        if (mean >= 15 && mean <= 24 && sd < 5.5) {
            subScore = Math.min(100, subScore + 10);
        }

        return {
            stdDev: sd.toFixed(1),
            mean: mean.toFixed(1),
            rawSd: sd,
            rawMean: mean,
            lengths,
            subScore
        };
    }

    // Helper: Execute a single rule array against text, returning issue objects
    function runRuleList(text, ruleList, priorityOffset) {
        const matches = [];
        if (!Array.isArray(ruleList)) return matches;

        for (const rule of ruleList) {
            const rx = new RegExp(rule.regex.source, rule.regex.flags);
            let m;
            while ((m = rx.exec(text)) !== null) {
                let start = m.index;
                let matchedStr = m[0];
                let fnArgs = [];

                if (rule.hasLeadingBoundary && m[1] !== undefined && m[2] !== undefined) {
                    start = m.index + m[1].length;
                    matchedStr = m[2];
                    fnArgs = [matchedStr, ...m.slice(2)];
                } else {
                    fnArgs = [matchedStr, ...m.slice(1)];
                }

                const end = start + matchedStr.length;
                if (end <= start) {
                    if (rx.lastIndex === m.index) rx.lastIndex++;
                    continue;
                }

                let replacement = null;
                if (typeof rule.replacementFn === 'function') {
                    try {
                        replacement = rule.replacementFn.apply(null, fnArgs);
                    } catch (e) {
                        replacement = null;
                    }
                }

                const canAutoFix = typeof replacement === 'string' && replacement.trim().length > 0 && replacement !== matchedStr;
                const tier = canAutoFix ? (rule.tier || 1) : 3;
                const severityLabel = rule.severity >= 4 ? 'high' : (rule.severity === 3 ? 'medium' : 'low');

                matches.push({
                    start,
                    end,
                    textSpan: matchedStr,
                    ruleId: rule.id,
                    ruleRef: rule,
                    category: pickRuleText(rule, 'name'),
                    dimension: rule.dimension || 'authenticity',
                    tier,
                    canAutoFix,
                    priority: priorityOffset + (rule.severity || 3),
                    severity: severityLabel,
                    severityNum: rule.severity || 3,
                    reason: pickRuleText(rule, 'reason') || pickRuleText(rule, 'suggestion'),
                    guidance: pickRuleText(rule, 'suggestion') || pickRuleText(rule, 'prevent'),
                    suggestedReplacement: canAutoFix ? replacement : null
                });

                if (rx.lastIndex === m.index) rx.lastIndex++;
            }
        }
        return matches;
    }

    // Pillar 2: AI Phrases & Layer 1 Whole-Clause Capture-Group Engine + 4 Dimensions
    function calculateRuleEngineMetrics(text, totalUnits) {
        const clauseMatches = runRuleList(text, RULES.clauseRewriteRules || [], 10);
        const tokenMatches = runRuleList(text, RULES.detectionRules || [], 0);

        const all = [...clauseMatches, ...tokenMatches].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            if (b.priority !== a.priority) return b.priority - a.priority;
            return (b.end - b.start) - (a.end - a.start);
        });

        const deduped = [];
        for (const item of all) {
            const overlaps = deduped.some((kept) => !(item.end <= kept.start || item.start >= kept.end));
            if (!overlaps) {
                deduped.push(item);
            }
        }

        const dimPenalties = { authenticity: 0, density: 0, directness: 0, trust: 0 };
        let totalSeverityWeight = 0;

        for (const m of deduped) {
            totalSeverityWeight += m.severityNum;
            if (dimPenalties[m.dimension] !== undefined) {
                dimPenalties[m.dimension] += m.severityNum * 4.2;
            }
        }

        const denom = Math.max(totalUnits / 100, 0.65);
        const weightedDensity = totalSeverityWeight / denom;
        const subScore = Math.max(0, Math.min(100, Math.round(weightedDensity * 4.5)));

        const scaleFactor = Math.min(1.2, 100 / Math.max(totalUnits, 60));
        const dimensionScores = {
            authenticity: Math.max(5, Math.min(100, Math.round(100 - dimPenalties.authenticity * scaleFactor))),
            density: Math.max(5, Math.min(100, Math.round(100 - dimPenalties.density * scaleFactor))),
            directness: Math.max(5, Math.min(100, Math.round(100 - dimPenalties.directness * scaleFactor))),
            trust: Math.max(5, Math.min(100, Math.round(100 - dimPenalties.trust * scaleFactor)))
        };

        return { matches: deduped, hitCount: deduped.length, subScore, dimensionScores };
    }

    // Pillar 3: STEM-Safe Predictability (Glue-Word Nominalization Density)
    function isWhitelistedStemWord(word) {
        const wl = RULES.stemWhitelist;
        if (!wl) return false;
        const lower = word.toLowerCase();
        if (wl.words instanceof Set && wl.words.has(lower)) return true;
        if (Array.isArray(wl.words) && wl.words.includes(word)) return true;
        if (wl.morphologyRegex && wl.morphologyRegex.test(word)) return true;
        return false;
    }

    function calculateGlueLexicalPredictability(text, sentences, existingMatches) {
        const whitelistedSet = new Set();
        const wl = RULES.stemWhitelist || {};
        const glue = RULES.glueConfig || {};
        const copy = t();

        const enTokens = text.match(/\b[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*\b/g) || [];
        const nonStemTokens = [];

        for (const tok of enTokens) {
            if (isWhitelistedStemWord(tok)) {
                whitelistedSet.add(tok);
            } else if (tok.length >= 4 && !/^\d+$/.test(tok)) {
                nonStemTokens.push(tok.toLowerCase());
            }
        }

        if (Array.isArray(wl.words)) {
            for (const term of wl.words) {
                if (text.includes(term)) {
                    whitelistedSet.add(term);
                }
            }
        }

        let ttr = 0.72;
        if (IS_ZH) {
            const zhChunks = text.match(/[\u4e00-\u9fff]{2}/g) || [];
            const filtered = zhChunks.filter((c) => !whitelistedSet.has(c));
            ttr = filtered.length > 0 ? (new Set(filtered).size / filtered.length) : 0.75;
        } else if (nonStemTokens.length > 0) {
            ttr = new Set(nonStemTokens).size / nonStemTokens.length;
        }

        const sentenceIssues = [];
        let predictableSentenceCount = 0;

        for (const sent of sentences) {
            const sentStr = sent.text;
            if (sentStr.length < (IS_ZH ? 22 : 35)) continue;

            const hasAnchor = glue.anchorRegex ? glue.anchorRegex.test(sentStr) : false;
            const hasExpressivePunct = glue.expressivePunctRegex ? glue.expressivePunctRegex.test(sentStr) : false;
            const overlapsExisting = existingMatches.some((m) => !(sent.end <= m.start || sent.start >= m.end));

            let isGlueDense = false;
            let flaggedSamples = [];

            if (IS_ZH) {
                const glueHits = sentStr.match(glue.glueAiTermsRegex) || [];
                const nomMatches = (sentStr.match(/[\u4e00-\u9fff]{2,4}/g) || []).filter((w) =>
                    !whitelistedSet.has(w) && glue.nominalizationRegex && glue.nominalizationRegex.test(w)
                );
                if (!hasAnchor && !hasExpressivePunct && sentStr.length >= 26 && (glueHits.length >= 2 || nomMatches.length >= 3)) {
                    isGlueDense = true;
                    flaggedSamples = [...new Set([...glueHits, ...nomMatches])].slice(0, 3);
                }
            } else {
                const sentWords = sentStr.match(/\b[a-zA-Z]{4,}\b/g) || [];
                const glueNoms = sentWords.filter((w) =>
                    !isWhitelistedStemWord(w) && glue.nominalizationRegex && glue.nominalizationRegex.test(w)
                );
                const glueAiTerms = (sentStr.match(glue.glueAiTermsRegex) || []).filter((w) => !isWhitelistedStemWord(w));
                if (!hasAnchor && !hasExpressivePunct && sentWords.length >= 14 && (glueAiTerms.length >= 2 || glueNoms.length >= 4)) {
                    isGlueDense = true;
                    flaggedSamples = [...new Set([...glueAiTerms, ...glueNoms])].slice(0, 3);
                }
            }

            if (isGlueDense) {
                predictableSentenceCount++;
                if (!overlapsExisting) {
                    let revised = sentStr;
                    for (const rep of (glue.humanizeSentenceReplacements || [])) {
                        revised = revised.replace(rep.regex, rep.replace);
                    }
                    const canAutoFix = revised !== sentStr;
                    sentenceIssues.push({
                        start: sent.start,
                        end: sent.end,
                        textSpan: sentStr,
                        ruleId: 'glue_nominalization',
                        category: copy.glueIssueName,
                        dimension: 'density',
                        tier: canAutoFix ? 1 : 3,
                        canAutoFix,
                        priority: 3,
                        severity: flaggedSamples.length >= 3 ? 'high' : 'medium',
                        severityNum: flaggedSamples.length >= 3 ? 4 : 3,
                        reason: copy.glueIssueReason(flaggedSamples.join(', ')),
                        guidance: copy.glueIssueGuidance,
                        suggestedReplacement: canAutoFix ? revised : null
                    });
                }
            }
        }

        let subScore = 18;
        if (sentences.length > 0) {
            const ratioScore = (predictableSentenceCount / sentences.length) * 85;
            const ttrPenalty = ((IS_ZH ? text.length >= 120 : nonStemTokens.length >= 40) && ttr < 0.56) ? 18 : 0;
            subScore = Math.round(Math.min(100, Math.max(8, ratioScore + ttrPenalty)));
        }

        const whitelistedTerms = Array.from(whitelistedSet);
        if (whitelistedTerms.length >= 3 && predictableSentenceCount === 0) {
            subScore = Math.min(subScore, 14);
        }

        return {
            whitelistedTerms,
            sentenceIssues,
            ttr: ttr.toFixed(2),
            subScore
        };
    }

    // Pillar 4: Structure (Paragraph Symmetry / Coefficient of Variation)
    function calculateParagraphSymmetry(text) {
        const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
        if (paras.length < 2) {
            return { paraCount: paras.length, cv: 'N/A', rawCv: 1, subScore: 22 };
        }
        const lengths = paras.map((p) => p.length);
        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
        const sd = Math.sqrt(variance);
        const cv = mean > 0 ? sd / mean : 0;

        let subScore = 15;
        if (cv < 0.08) subScore = 92;
        else if (cv < 0.16) subScore = 74;
        else if (cv < 0.26) subScore = 48;
        else if (cv < 0.38) subScore = 25;
        else subScore = 10;

        return { paraCount: paras.length, cv: cv.toFixed(2), rawCv: cv, subScore };
    }

    // Pillar 5: Grammar (Complexity Grade vs. Grammar Flawlessness)
    function countEnglishSyllables(word) {
        const w = word.toLowerCase().replace(/[^a-z]/g, '');
        if (w.length <= 3) return 1;
        const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
        const matches = trimmed.match(/[aeiouy]{1,2}/g);
        return matches ? Math.max(1, matches.length) : 1;
    }

    function calculateComplexityGrade(text, sentences) {
        if (sentences.length === 0) {
            return { grade: 8.0, label: IS_ZH ? 'CJK 8.0' : 'FK 8.0' };
        }
        if (IS_ZH) {
            const totalChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
            const avgSentChars = totalChars / Math.max(sentences.length, 1);
            const commaCount = (text.match(/[，、；]/g) || []).length;
            const clausesPerSent = (commaCount / Math.max(sentences.length, 1)) + 1;
            const grade = Math.min(18, Math.max(6, (avgSentChars * 0.24) + (clausesPerSent * 2.1)));
            return { grade: Number(grade.toFixed(1)), label: `CJK ${grade.toFixed(1)}` };
        }
        const words = text.match(/\b[a-zA-Z]+\b/g) || [];
        if (words.length === 0) return { grade: 8.0, label: 'FK 8.0' };
        const totalSyllables = words.reduce((acc, w) => acc + countEnglishSyllables(w), 0);
        const fk = 0.39 * (words.length / Math.max(sentences.length, 1)) + 11.8 * (totalSyllables / words.length) - 15.59;
        const clamped = Math.max(4, Math.min(20, fk));
        return { grade: Number(clamped.toFixed(1)), label: `FK ${clamped.toFixed(1)}` };
    }

    function runLocalGrammarHeuristics(text) {
        let errors = 0;
        for (const h of (RULES.grammarHeuristics || [])) {
            if (h.regex.test(text)) {
                errors += (h.weight || 1);
            }
        }
        return { errorCount: errors, source: IS_ZH ? '本地語法檢核' : 'Local Check' };
    }

    async function checkGrammarWithApi(text) {
        const snippet = text.slice(0, 1800);
        const apiLang = RULES.languageToolCode || (IS_ZH ? 'zh-CN' : 'en-US');

        if (typeof fetch !== 'function') {
            return runLocalGrammarHeuristics(text);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const body = new URLSearchParams({ text: snippet, language: apiLang });
            const resp = await fetch('https://api.languagetool.org/v2/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!resp.ok) throw new Error('LanguageTool API non-200');
            const data = await resp.json();
            const realErrors = (data.matches || []).filter((m) => {
                const cat = m.rule && m.rule.category && m.rule.category.id ? m.rule.category.id : '';
                return cat !== 'WHITESPACE' && cat !== 'STYLE';
            }).length;
            return { errorCount: realErrors, source: 'LanguageTool API' };
        } catch (err) {
            clearTimeout(timeoutId);
            return runLocalGrammarHeuristics(text);
        }
    }

    function evaluateGrammarAndComplexityPillar(complexityGrade, errorCount) {
        if (complexityGrade >= 13.0 && errorCount === 0) return 90;
        if (complexityGrade >= 11.5 && errorCount === 0) return 72;
        if (complexityGrade >= 13.0 && errorCount === 1) return 48;
        if (errorCount >= 2) return 14;
        if (complexityGrade < 10.0) return 22;
        return 38;
    }

    // =========================================================================
    // LAYER 2: RHYTHM (SENTENCE SPLIT) & STRUCTURE (PARAGRAPH SPLIT)
    // =========================================================================
    function buildLayer2FlowAndStructureIssues(text, sentences, burstiness, symmetry, existingIssues) {
        const flowCfg = RULES.flowSplitConfig;
        if (!flowCfg) return [];

        const copy = t();
        const added = [];
        const isOverlapping = (start, end) =>
            existingIssues.some((e) => !(end <= e.start || start >= e.end)) ||
            added.some((e) => !(end <= e.start || start >= e.end));

        // 2A. Sentence Flow Splitting (100% meaning-preserving two-sentence split)
        const needFlowVariety = burstiness.subScore >= 45;
        let flowSplitsFound = 0;

        for (let i = 0; i < sentences.length && flowSplitsFound < 3; i++) {
            const s = sentences[i];
            const units = countSemanticUnits(s.text);
            const isTooLong = units >= flowCfg.minSentenceUnitsToSplit;
            const isUniform = needFlowVariety && units >= 15 && Math.abs(units - burstiness.rawMean) <= (flowCfg.uniformLengthTolerance || 4);

            if (!isTooLong && !isUniform) continue;
            if (isOverlapping(s.start, s.end)) continue;

            for (const conn of (flowCfg.sentenceConnectors || [])) {
                const match = conn.regex.exec(s.text);
                if (!match) continue;

                const leftPart = s.text.slice(0, match.index).trim();
                const rightCapture = (match[1] || '').trim();
                const leftUnits = countSemanticUnits(leftPart);
                const rightUnits = countSemanticUnits(rightCapture);

                if (leftUnits >= 6 && rightUnits >= 5) {
                    let splitText = conn.splitFn(leftPart, rightCapture);
                    const origEnd = s.text.slice(-1);
                    if (/[.!?。！？]/.test(origEnd) && !/[.!?。！？]$/.test(splitText)) {
                        splitText += origEnd;
                    }
                    if (splitText && splitText !== s.text) {
                        added.push({
                            start: s.start,
                            end: s.end,
                            textSpan: s.text,
                            ruleId: 'flow_sentence_split',
                            category: copy.flowIssueName,
                            dimension: 'directness',
                            tier: 2,
                            canAutoFix: true,
                            priority: 2,
                            severity: 'flow',
                            severityNum: 3,
                            reason: copy.flowIssueReason,
                            guidance: copy.flowIssueReason,
                            suggestedReplacement: splitText
                        });
                        flowSplitsFound++;
                        break;
                    }
                }
            }
        }

        // 2B. Paragraph Symmetry Splitting (Insert \n\n before logical transition sentence)
        const needParaBreak = (symmetry.subScore >= 50 && symmetry.paraCount >= 2) ||
            (symmetry.paraCount === 1 && sentences.length >= 4 && text.length >= (IS_ZH ? 150 : 280));

        if (needParaBreak && flowCfg.paragraphSplitTransitions) {
            const paraRegex = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
            let pm;
            let paraSplitsFound = 0;

            while ((pm = paraRegex.exec(text)) !== null && paraSplitsFound < 2) {
                const pStart = pm.index;
                const pEnd = pStart + pm[0].length;
                const pSentences = sentences.filter((s) => s.start >= pStart && s.end <= pEnd);
                if (pSentences.length < 3) continue;

                for (let j = 1; j < pSentences.length; j++) {
                    const cand = pSentences[j];
                    if (!flowCfg.paragraphSplitTransitions.test(cand.text)) continue;
                    if (isOverlapping(cand.start, cand.end)) continue;

                    added.push({
                        start: cand.start,
                        end: cand.end,
                        textSpan: cand.text,
                        ruleId: 'structure_para_split',
                        category: copy.paraSplitName,
                        dimension: 'directness',
                        tier: 2,
                        canAutoFix: true,
                        isParagraphSplit: true,
                        priority: 2,
                        severity: 'flow',
                        severityNum: 3,
                        reason: copy.paraSplitReason,
                        guidance: copy.paraSplitReason,
                        previewNote: copy.paraSplitPreview,
                        suggestedReplacement: `\n\n${cand.text}`
                    });
                    paraSplitsFound++;
                    break;
                }
            }
        }

        return added;
    }

    // =========================================================================
    // LAYER 3: COMPLEX STRUCTURAL PATTERNS (REPETITIVE OPENERS + MANUAL CHECKS)
    // =========================================================================
    function extractSentenceOpenerKey(sentenceText) {
        const clean = sentenceText.trim().replace(/^["'「『（(]+/, '');
        if (IS_ZH) {
            const zhMatch = clean.match(/^[\u4e00-\u9fff]{1,2}/);
            return zhMatch ? zhMatch[0] : '';
        }
        const enMatch = clean.match(/^[A-Za-z]+(?:'[A-Za-z]+)?/);
        return enMatch ? enMatch[0].toLowerCase() : '';
    }

    function buildLayer3ManualIssues(text, sentences, existingIssues) {
        const copy = t();
        const added = [];
        const isOverlapping = (start, end) =>
            existingIssues.some((e) => !(end <= e.start || start >= e.end)) ||
            added.some((e) => !(end <= e.start || start >= e.end));

        // 3A. Manual Review Checks (Weasel Authority, False Agency, Vague Claims)
        for (const check of (RULES.manualReviewChecks || [])) {
            const rx = new RegExp(check.regex.source, check.regex.flags);
            let m;
            while ((m = rx.exec(text)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                if (!isOverlapping(start, end)) {
                    added.push({
                        start,
                        end,
                        textSpan: m[0],
                        ruleId: check.id,
                        ruleRef: check,
                        category: pickRuleText(check, 'name'),
                        dimension: check.dimension || 'trust',
                        tier: 3,
                        canAutoFix: false,
                        priority: 1,
                        severity: 'medium',
                        severityNum: 4,
                        reason: pickRuleText(check, 'reason'),
                        guidance: pickRuleText(check, 'advice'),
                        suggestedReplacement: null
                    });
                }
                if (rx.lastIndex === m.index) rx.lastIndex++;
            }
        }

        // 3B. Consecutive Identical Sentence Openers (3+ in a row)
        if (sentences.length >= 3) {
            let runCount = 1;
            let prevKey = extractSentenceOpenerKey(sentences[0].text);

            for (let i = 1; i < sentences.length; i++) {
                const key = extractSentenceOpenerKey(sentences[i].text);
                if (key && key === prevKey) {
                    runCount++;
                    if (runCount === 3) {
                        const target = sentences[i];
                        if (!isOverlapping(target.start, target.end)) {
                            added.push({
                                start: target.start,
                                end: target.end,
                                textSpan: target.text,
                                ruleId: 'tier3_repetitive_openers',
                                category: copy.openerIssueName,
                                dimension: 'authenticity',
                                tier: 3,
                                canAutoFix: false,
                                priority: 1,
                                severity: 'medium',
                                severityNum: 3,
                                reason: copy.openerIssueReason(key),
                                guidance: copy.openerIssueGuidance,
                                suggestedReplacement: null
                            });
                        }
                    }
                } else {
                    prevKey = key;
                    runCount = 1;
                }
            }
        }

        return added;
    }

    // =========================================================================
    // MAIN ORCHESTRATOR
    // =========================================================================
    async function analyzeAcademicPassage(text) {
        const sentences = splitIntoSentencesWithOffsets(text);
        const totalUnits = Math.max(countSemanticUnits(text), 1);

        const burstiness = calculateBurstinessMetrics(sentences);
        const ruleMetrics = calculateRuleEngineMetrics(text, totalUnits);
        const glueMetrics = calculateGlueLexicalPredictability(text, sentences, ruleMetrics.matches);
        const symmetry = calculateParagraphSymmetry(text);
        const complexity = calculateComplexityGrade(text, sentences);
        const grammarCheck = await checkGrammarWithApi(text);
        const grammarSubScore = evaluateGrammarAndComplexityPillar(complexity.grade, grammarCheck.errorCount);

        const baseIssues = [...ruleMetrics.matches, ...glueMetrics.sentenceIssues];
        const layer2Issues = buildLayer2FlowAndStructureIssues(text, sentences, burstiness, symmetry, baseIssues);
        const layer3Issues = buildLayer3ManualIssues(text, sentences, [...baseIssues, ...layer2Issues]);

        const combined = [...baseIssues, ...layer2Issues, ...layer3Issues].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return (b.priority || 0) - (a.priority || 0);
        });

        const nonOverlapping = [];
        let lastEnd = -1;
        for (const item of combined) {
            if (item.start >= lastEnd) {
                nonOverlapping.push(item);
                lastEnd = item.end;
            }
        }

        let overallScore = Math.round(
            (burstiness.subScore * 0.23) +
            (ruleMetrics.subScore * 0.30) +
            (glueMetrics.subScore * 0.17) +
            (symmetry.subScore * 0.15) +
            (grammarSubScore * 0.15)
        );

        if (ruleMetrics.subScore >= 75 && overallScore < 65) {
            overallScore = Math.round((overallScore + ruleMetrics.subScore) / 2);
        }

        if (glueMetrics.whitelistedTerms.length >= 4 && ruleMetrics.hitCount === 0 && burstiness.subScore <= 40) {
            overallScore = Math.min(overallScore, 18);
        }

        overallScore = Math.max(0, Math.min(100, overallScore));

        return {
            overallScore,
            burstiness,
            ruleMetrics,
            glueMetrics,
            symmetry,
            complexity,
            grammarCheck,
            grammarSubScore,
            dimensionScores: ruleMetrics.dimensionScores,
            whitelistedTerms: glueMetrics.whitelistedTerms,
            issues: nonOverlapping
        };
    }

    // =========================================================================
    // SCAN TRIGGER & UI ACTIONS
    // =========================================================================
    async function runManualScan(shouldSave) {
        const saveFlag = shouldSave !== false;
        const inputEl = document.getElementById('passageInput');
        const input = (inputEl ? inputEl.value : '').trim();
        const copy = t();

        if (!input) {
            showToast(copy.toastEmpty);
            if (inputEl) inputEl.focus();
            return;
        }
        currentPassage = input;

        const scanBtn = document.getElementById('scanTextBtn');
        const originalHtml = scanBtn ? scanBtn.innerHTML : '';
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> <span>${escapeHtml(copy.scanning)}</span>`;
        }

        try {
            const analysis = await analyzeAcademicPassage(currentPassage);
            lastAnalysis = analysis;
            detectedIssues = analysis.issues;
            activeIssueIndex = 0;

            if (saveFlag) {
                saveToMemory(currentPassage, analysis.overallScore);
            }

            updateScoreUI(analysis.overallScore);
            updateDimensionScoresUI(analysis.dimensionScores);
            updatePillarBreakdownUI(analysis);
            renderWhitelistBanner(analysis.whitelistedTerms);
            renderAnnotatedText();
            renderInspector();
            switchEditorMode('highlight');
            showToast(copy.toastScanDone(analysis.overallScore));
        } catch (err) {
            console.error('[ScholaraPuppy] Scan error:', err);
            showToast(copy.toastScanErr);
        } finally {
            if (scanBtn) {
                scanBtn.disabled = false;
                scanBtn.innerHTML = originalHtml || `<i class="ph-fill ph-magnifying-glass"></i> <span>${escapeHtml(copy.scanBtn)}</span>`;
            }
        }
    }

    // =========================================================================
    // PAGE, EDITOR MODE & ACCORDION CONTROLS
    // =========================================================================
    function switchPage(page) {
        const scannerPage = document.getElementById('pageScanner');
        const refPage = document.getElementById('pageReference');
        const navScannerBtn = document.getElementById('navScannerBtn');
        const navRefBtn = document.getElementById('navRefBtn');
        if (!scannerPage || !refPage) return;

        const activeCls = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition bg-white text-cute-cocoa shadow-sm flex items-center gap-1.5';
        const idleCls = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition text-cute-cocoa/70 hover:text-cute-cocoa flex items-center gap-1.5';

        if (page === 'reference') {
            scannerPage.classList.add('hidden');
            refPage.classList.remove('hidden');
            if (navRefBtn) navRefBtn.className = activeCls;
            if (navScannerBtn) navScannerBtn.className = idleCls;
        } else {
            refPage.classList.add('hidden');
            scannerPage.classList.remove('hidden');
            if (navScannerBtn) navScannerBtn.className = activeCls;
            if (navRefBtn) navRefBtn.className = idleCls;
        }
    }

    function switchEditorMode(mode) {
        const rawContainer = document.getElementById('rawEditorContainer');
        const annotatedContainer = document.getElementById('annotatedContainer');
        const editBtn = document.getElementById('tabEditBtn');
        const highlightBtn = document.getElementById('tabHighlightBtn');
        if (!rawContainer || !annotatedContainer) return;

        const activeCls = 'px-3 py-1 rounded-lg text-xs font-bold transition bg-white text-cute-cocoa shadow-sm';
        const idleCls = 'px-3 py-1 rounded-lg text-xs font-bold transition text-cute-cocoa/65 hover:text-cute-cocoa';

        if (mode === 'highlight') {
            rawContainer.classList.add('hidden');
            annotatedContainer.classList.remove('hidden');
            if (highlightBtn) highlightBtn.className = activeCls;
            if (editBtn) editBtn.className = idleCls;
        } else {
            annotatedContainer.classList.add('hidden');
            rawContainer.classList.remove('hidden');
            if (editBtn) editBtn.className = activeCls;
            if (highlightBtn) highlightBtn.className = idleCls;
            const inputEl = document.getElementById('passageInput');
            if (inputEl) inputEl.focus();
        }
    }

    function togglePillarBreakdown() {
        const btn = document.getElementById('pillarToggleBtn');
        const panel = document.getElementById('pillarBreakdownPanel');
        const label = document.getElementById('pillarToggleText');
        if (!btn || !panel) return;

        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !isHidden);
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        if (label) {
            label.textContent = isHidden ? t().pillarToggleHide : t().pillarToggleShow;
        }
    }

    function clearEditorText() {
        const inputEl = document.getElementById('passageInput');
        if (inputEl) inputEl.value = '';
        currentPassage = '';
        detectedIssues = [];
        activeIssueIndex = 0;
        lastAnalysis = null;
        undoStack = [];
        updateWordCount();
        updateScoreUI(0);
        resetPillarBars();
        renderInspector();
        const banner = document.getElementById('whitelistProtectedBanner');
        if (banner) banner.classList.add('hidden');
        switchEditorMode('edit');
        showToast(t().toastCleared);
    }

    function loadBenchmarkIntoScanner(text) {
        switchPage('scanner');
        const inputEl = document.getElementById('passageInput');
        if (inputEl) {
            inputEl.value = text;
            updateWordCount();
            runManualScan(true);
        }
    }

    // =========================================================================
    // SCORE, 4 DIMENSIONS & COLLAPSIBLE 5-PILLAR UI UPDATERS
    // =========================================================================
    function updateScoreUI(score) {
        const circle = document.getElementById('scoreGaugeCircle');
        const pctText = document.getElementById('scorePercentageText');
        const badge = document.getElementById('verdictBadge');
        if (!circle || !pctText || !badge) return;

        const copy = t();
        const circumference = 314.16;
        const offset = circumference - (score / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        pctText.textContent = `${score}%`;

        if (score >= 60) {
            circle.setAttribute('stroke', '#c86d81');
            badge.textContent = copy.verdictHigh;
            badge.className = 'inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-[#f9dfe4] text-[#6e2d3b] border border-[#e3b8c1]';
        } else if (score >= 28) {
            circle.setAttribute('stroke', '#d49e3d');
            badge.textContent = copy.verdictMid;
            badge.className = 'inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-cute-yellowSoft text-[#6b4e16] border border-[#ebd68f]';
        } else if (currentPassage) {
            circle.setAttribute('stroke', '#4d9e7d');
            badge.textContent = copy.verdictLow;
            badge.className = 'inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-[#e3f5ec] text-[#225741] border border-[#b7e0cc]';
        } else {
            circle.setAttribute('stroke', '#c86d81');
            badge.textContent = copy.verdictReady;
            badge.className = 'inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-cute-cream text-cute-cocoa border border-cute-creamBorder';
        }
    }

    function setDimensionColor(el, val) {
        if (!el) return;
        el.textContent = `${val}`;
        if (val >= 75) el.className = 'font-mono text-sm font-extrabold text-[#256346]';
        else if (val >= 45) el.className = 'font-mono text-sm font-extrabold text-[#b37d1e]';
        else el.className = 'font-mono text-sm font-extrabold text-cute-pink';
    }

    function updateDimensionScoresUI(dims) {
        if (!dims) return;
        setDimensionColor(document.getElementById('dimAuthenticityVal'), dims.authenticity);
        setDimensionColor(document.getElementById('dimDensityVal'), dims.density);
        setDimensionColor(document.getElementById('dimDirectnessVal'), dims.directness);
        setDimensionColor(document.getElementById('dimTrustVal'), dims.trust);
    }

    function setPillarRow(rowId, barId, pctId, score, tooltipText) {
        const row = document.getElementById(rowId);
        const bar = document.getElementById(barId);
        const pct = document.getElementById(pctId);
        const clamped = Math.max(0, Math.min(100, Math.round(score)));

        if (pct) pct.textContent = `${clamped}%`;
        if (row && tooltipText) {
            row.setAttribute('data-tooltip', tooltipText);
        }
        if (bar) {
            bar.style.width = `${clamped}%`;
            if (clamped >= 60) bar.className = 'h-full bg-cute-pink transition-all duration-500';
            else if (clamped >= 30) bar.className = 'h-full bg-[#d49e3d] transition-all duration-500';
            else bar.className = 'h-full bg-[#4d9e7d] transition-all duration-500';
        }
    }

    function updatePillarBreakdownUI(analysis) {
        const tips = t().pillarTips;
        setPillarRow('p1Row', 'p1Bar', 'p1Pct', analysis.burstiness.subScore, tips.p1(analysis.burstiness.stdDev, analysis.burstiness.mean));
        setPillarRow('p2Row', 'p2Bar', 'p2Pct', analysis.ruleMetrics.subScore, tips.p2(analysis.ruleMetrics.hitCount));
        setPillarRow('p3Row', 'p3Bar', 'p3Pct', analysis.glueMetrics.subScore, tips.p3(analysis.whitelistedTerms.length, analysis.glueMetrics.ttr));
        setPillarRow('p4Row', 'p4Bar', 'p4Pct', analysis.symmetry.subScore, tips.p4(analysis.symmetry.cv, analysis.symmetry.paraCount));
        setPillarRow('p5Row', 'p5Bar', 'p5Pct', analysis.grammarSubScore, tips.p5(analysis.complexity.label, analysis.grammarCheck.errorCount, analysis.grammarCheck.source));
    }

    function resetPillarBars() {
        const idle = t().pillarIdleTip;
        setPillarRow('p1Row', 'p1Bar', 'p1Pct', 0, idle);
        setPillarRow('p2Row', 'p2Bar', 'p2Pct', 0, idle);
        setPillarRow('p3Row', 'p3Bar', 'p3Pct', 0, idle);
        setPillarRow('p4Row', 'p4Bar', 'p4Pct', 0, idle);
        setPillarRow('p5Row', 'p5Bar', 'p5Pct', 0, idle);

        ['dimAuthenticityVal', 'dimDensityVal', 'dimDirectnessVal', 'dimTrustVal'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '—';
                el.className = 'font-mono text-sm font-extrabold text-cute-cocoa';
            }
        });
    }

    function renderWhitelistBanner(terms) {
        const banner = document.getElementById('whitelistProtectedBanner');
        const listEl = document.getElementById('whitelistTermsList');
        if (!banner || !listEl) return;

        if (!terms || terms.length === 0) {
            banner.classList.add('hidden');
            return;
        }
        const shown = terms.slice(0, 12).join(', ');
        const more = terms.length > 12 ? ` (+${terms.length - 12})` : '';
        listEl.textContent = t().whitelistPrefix(terms.length, shown, more);
        banner.classList.remove('hidden');
    }

    // =========================================================================
    // ANNOTATED TEXT & UNIFIED SINGLE-CARD PROBLEM INSPECTOR
    // =========================================================================
    function renderAnnotatedText() {
        const container = document.getElementById('annotatedTextBody');
        const fixAllBtn = document.getElementById('fixAllBtn');
        if (!container) return;

        const copy = t();
        const autoFixCount = detectedIssues.filter((i) => i.canAutoFix).length;

        if (fixAllBtn) {
            if (autoFixCount > 0) {
                fixAllBtn.classList.remove('hidden');
                fixAllBtn.innerHTML = `<i class="ph-fill ph-magic-wand text-cute-pink"></i> <span>${escapeHtml(copy.btnApplyAll(autoFixCount))}</span>`;
            } else {
                fixAllBtn.classList.add('hidden');
            }
        }

        if (detectedIssues.length === 0) {
            container.innerHTML = `
                <div class="p-3.5 mb-4 rounded-xl bg-[#e3f5ec] border border-[#b7e0cc] text-[#225741] text-xs font-sans font-bold flex items-center gap-2">
                    <i class="ph-fill ph-check-circle text-lg shrink-0"></i>
                    <span>${escapeHtml(copy.cleanBanner)}</span>
                </div>
                <p class="whitespace-pre-wrap">${escapeHtml(currentPassage)}</p>
            `;
            return;
        }

        let html = '';
        let cursor = 0;
        detectedIssues.forEach((issue, idx) => {
            html += escapeHtml(currentPassage.slice(cursor, issue.start));
            let sevClass = 'highlight-low';
            if (issue.tier === 2 || issue.severity === 'flow') sevClass = 'highlight-flow';
            else if (issue.severity === 'high') sevClass = 'highlight-high';
            else if (issue.severity === 'medium') sevClass = 'highlight-medium';

            const activeClass = idx === activeIssueIndex ? 'active-span' : '';
            html += `<span onclick="selectIssue(${idx})" class="highlight-span ${sevClass} ${activeClass}">${escapeHtml(issue.textSpan)}<sup class="ml-0.5 font-sans font-bold text-[10px] opacity-75">[${idx + 1}]</sup></span>`;
            cursor = issue.end;
        });
        html += escapeHtml(currentPassage.slice(cursor));
        container.innerHTML = `<div class="whitespace-pre-wrap">${html}</div>`;
    }

    function selectIssue(idx) {
        activeIssueIndex = idx;
        document.querySelectorAll('.highlight-span').forEach((el, i) => {
            el.classList.toggle('active-span', i === idx);
        });
        renderInspector();
    }

    function navigateIssue(dir) {
        if (detectedIssues.length === 0) return;
        activeIssueIndex = (activeIssueIndex + dir + detectedIssues.length) % detectedIssues.length;
        selectIssue(activeIssueIndex);
    }

    function renderInspector() {
        const body = document.getElementById('inspectorBody');
        const counter = document.getElementById('inspectorCounter');
        if (!body || !counter) return;

        const copy = t();
        const undoHtml = undoStack.length > 0
            ? `<div class="pt-3 border-t border-cute-blushBorder">
                   <button type="button" onclick="undoLastFix()" class="w-full py-1.5 rounded-xl bg-cute-blush/70 hover:bg-cute-blush text-cute-cocoa font-bold text-xs transition flex items-center justify-center gap-1.5">
                       <i class="ph-bold ph-arrow-counter-clockwise"></i> ${escapeHtml(copy.btnUndo)}
                   </button>
               </div>`
            : '';

        if (!currentPassage) {
            counter.textContent = '0 / 0';
            body.innerHTML = `
                <div class="text-center py-8 text-cute-cocoa/70 text-xs font-semibold flex flex-col items-center gap-2.5">
                    <i class="ph-fill ph-paw-print text-3xl text-cute-pink"></i>
                    <p>${escapeHtml(copy.inspectorEmpty)}</p>
                </div>
            `;
            return;
        }

        if (detectedIssues.length === 0) {
            counter.textContent = '0 / 0';
            body.innerHTML = `
                <div class="text-center py-7 text-cute-cocoa/80 text-xs font-semibold flex flex-col items-center gap-2.5">
                    <i class="ph-fill ph-sparkle text-3xl text-[#4d9e7d]"></i>
                    <p>${escapeHtml(copy.inspectorClean)}</p>
                </div>
                ${undoHtml}
            `;
            return;
        }

        if (activeIssueIndex >= detectedIssues.length) activeIssueIndex = 0;
        const issue = detectedIssues[activeIssueIndex];
        counter.textContent = `${activeIssueIndex + 1} / ${detectedIssues.length}`;

        const categoryText = issue.ruleRef ? pickRuleText(issue.ruleRef, 'name') : issue.category;
        const reasonText = issue.ruleRef ? (pickRuleText(issue.ruleRef, 'reason') || pickRuleText(issue.ruleRef, 'suggestion')) : issue.reason;
        const guidanceText = issue.ruleRef ? (pickRuleText(issue.ruleRef, 'advice') || pickRuleText(issue.ruleRef, 'suggestion')) : issue.guidance;

        const tierBadgeCls = issue.tier === 1 ? 'tier-badge-1' : (issue.tier === 2 ? 'tier-badge-2' : 'tier-badge-3');
        const tierLabel = copy.tierLabels[issue.tier] || copy.tierLabels[1];
        const dimLabel = copy.dimLabels[issue.dimension] || issue.dimension;

        let actionBlockHtml = '';
        if (issue.canAutoFix && typeof issue.suggestedReplacement === 'string') {
            const previewText = issue.isParagraphSplit
                ? copy.paraSplitPreview
                : `"${issue.suggestedReplacement}"`;

            actionBlockHtml = `
                <div class="p-3.5 bg-[#f3faf6] border border-[#c5e3d3] rounded-xl space-y-2.5">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-[#225741] tracking-wide block">${escapeHtml(copy.labelRewrite)}</span>
                        <p class="font-serif text-sm text-[#1e4d39] mt-1 leading-relaxed whitespace-pre-wrap">${escapeHtml(previewText)}</p>
                    </div>
                    <button type="button" onclick="applySingleFix(${activeIssueIndex})" class="w-full py-2 rounded-xl bg-[#2d7a5b] hover:bg-[#236349] text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm">
                        <i class="ph-bold ph-check-circle text-sm"></i>
                        <span>${escapeHtml(copy.btnApplyFix)}</span>
                    </button>
                </div>
            `;
        } else {
            actionBlockHtml = `
                <div class="p-3.5 bg-cute-cream border border-cute-creamBorder rounded-xl space-y-2.5">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-[#8a5d10] tracking-wide block">${escapeHtml(copy.labelGuidance)}</span>
                        <p class="text-xs text-cute-cocoa/90 mt-1 leading-relaxed">${escapeHtml(guidanceText)}</p>
                    </div>
                    <button type="button" onclick="focusIssueInEditor(${activeIssueIndex})" class="w-full py-2 rounded-xl bg-cute-pink hover:bg-cute-pinkHover text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm">
                        <i class="ph-bold ph-cursor-text text-sm"></i>
                        <span>${escapeHtml(copy.btnFocusEditor)}</span>
                    </button>
                </div>
            `;
        }

        body.innerHTML = `
            <div class="p-3.5 bg-[#fffdf9] border border-cute-blushBorder rounded-xl space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${tierBadgeCls}">${escapeHtml(tierLabel)}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cute-blush/70 text-cute-cocoa/80 border border-cute-blushBorder">${escapeHtml(dimLabel)}</span>
                </div>
                <h3 class="text-xs font-extrabold text-cute-cocoa">${escapeHtml(categoryText)}</h3>
                <p class="font-serif text-sm bg-white p-2.5 rounded-lg border border-cute-blushBorder text-cute-cocoa leading-relaxed">"${escapeHtml(issue.textSpan)}"</p>
            </div>

            <div class="space-y-1">
                <span class="text-[10px] uppercase font-bold text-cute-pink tracking-wide">${escapeHtml(copy.labelReason)}</span>
                <p class="text-xs leading-relaxed text-cute-cocoa/90">${escapeHtml(reasonText)}</p>
            </div>

            ${actionBlockHtml}
            ${undoHtml}
        `;
    }

    // =========================================================================
    // APPLY FIXES, UNDO & TIER 3 EDITOR FOCUS
    // =========================================================================
    function cleanSpacingAfterEdit(str) {
        return str
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/[ \t]+([,.;:!?])/g, '$1')
            .replace(/([。！？，；])[ \t]+/g, '$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function applySingleFix(idx) {
        const issue = detectedIssues[idx];
        if (!issue || !issue.canAutoFix || typeof issue.suggestedReplacement !== 'string') return;

        undoStack.push(currentPassage);
        if (undoStack.length > 10) undoStack.shift();

        const before = currentPassage.slice(0, issue.start);
        const after = currentPassage.slice(issue.end);
        const joined = issue.isParagraphSplit
            ? before.replace(/[ \t]+$/, '') + issue.suggestedReplacement + after
            : before + issue.suggestedReplacement + after;

        currentPassage = cleanSpacingAfterEdit(joined);
        const inputEl = document.getElementById('passageInput');
        if (inputEl) inputEl.value = currentPassage;
        updateWordCount();
        runManualScan(true);
        showToast(t().toastFixApplied);
    }

    function applyAllSafeFixes() {
        const fixable = detectedIssues.filter((i) => i.canAutoFix && typeof i.suggestedReplacement === 'string');
        if (fixable.length === 0) {
            showToast(t().toastNoAutoFix);
            return;
        }

        undoStack.push(currentPassage);
        if (undoStack.length > 10) undoStack.shift();

        let updated = currentPassage;
        for (let i = fixable.length - 1; i >= 0; i--) {
            const iss = fixable[i];
            const before = updated.slice(0, iss.start);
            const after = updated.slice(iss.end);
            updated = iss.isParagraphSplit
                ? before.replace(/[ \t]+$/, '') + iss.suggestedReplacement + after
                : before + iss.suggestedReplacement + after;
        }

        currentPassage = cleanSpacingAfterEdit(updated);
        const inputEl = document.getElementById('passageInput');
        if (inputEl) inputEl.value = currentPassage;
        updateWordCount();
        runManualScan(true);
        showToast(t().toastAllApplied(fixable.length));
    }

    function undoLastFix() {
        if (undoStack.length === 0) return;
        currentPassage = undoStack.pop();
        const inputEl = document.getElementById('passageInput');
        if (inputEl) inputEl.value = currentPassage;
        updateWordCount();
        runManualScan(false);
        showToast(t().toastUndo);
    }

    function focusIssueInEditor(idx) {
        const issue = detectedIssues[idx];
        const inputEl = document.getElementById('passageInput');
        if (!issue || !inputEl) return;

        switchEditorMode('edit');
        inputEl.focus();

        if (inputEl.value !== currentPassage) {
            inputEl.value = currentPassage;
        }
        try {
            inputEl.setSelectionRange(issue.start, issue.end);
        } catch (e) {}

        const textBefore = currentPassage.slice(0, issue.start);
        const lineIndex = (textBefore.match(/\n/g) || []).length;
        inputEl.scrollTop = Math.max(0, (lineIndex - 2) * 28);

        inputEl.classList.remove('editor-focus-pulse');
        void inputEl.offsetWidth;
        inputEl.classList.add('editor-focus-pulse');
        showToast(t().toastFocused);
    }

    // =========================================================================
    // CLIPBOARD, TOAST & ESCAPING UTILITIES
    // =========================================================================
    function copyPassageText() {
        const text = document.getElementById('passageInput')?.value || '';
        const copy = t();
        if (!text) {
            showToast(copy.toastEmpty);
            return;
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(
                () => showToast(copy.toastCopied),
                () => fallbackCopy(text)
            );
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const copy = t();
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        try {
            document.execCommand('copy');
            showToast(copy.toastCopied);
        } catch (e) {
            showToast(copy.toastCopyFail);
        }
        document.body.removeChild(temp);
    }

    function showToast(msg) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'bg-cute-pink text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg border-2 border-[#b2596d] flex items-center gap-2 transition-all duration-300';
        toast.innerHTML = `<i class="ph-fill ph-paw-print"></i><span>${escapeHtml(msg)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2800);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeJsString(str) {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '');
    }

    // =========================================================================
    // EXPOSE TRADITIONAL GLOBAL API (WORKS DIRECTLY ON file:// WITHOUT BUNDLER)
    // =========================================================================
    global.ScholaraEngine = {
        init,
        setZhScript,
        switchPage,
        switchEditorMode,
        togglePillarBreakdown,
        runManualScan,
        loadSampleByKey,
        clearEditorText,
        copyPassageText,
        loadFromMemory,
        deleteMemoryItem,
        clearAllMemory,
        selectIssue,
        navigateIssue,
        applySingleFix,
        applyAllSafeFixes,
        undoLastFix,
        focusIssueInEditor,
        loadBenchmarkIntoScanner
    };

    // Bind global functions for inline HTML onclick handlers
    global.setZhScript = setZhScript;
    global.switchPage = switchPage;
    global.switchEditorMode = switchEditorMode;
    global.togglePillarBreakdown = togglePillarBreakdown;
    global.runManualScan = runManualScan;
    global.loadSampleByKey = loadSampleByKey;
    global.clearEditorText = clearEditorText;
    global.copyPassageText = copyPassageText;
    global.loadFromMemory = loadFromMemory;
    global.deleteMemoryItem = deleteMemoryItem;
    global.clearAllMemory = clearAllMemory;
    global.selectIssue = selectIssue;
    global.navigateIssue = navigateIssue;
    global.applySingleFix = applySingleFix;
    global.applyAllSafeFixes = applyAllSafeFixes;
    global.undoLastFix = undoLastFix;
    global.focusIssueInEditor = focusIssueInEditor;
    global.loadBenchmarkIntoScanner = loadBenchmarkIntoScanner;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);