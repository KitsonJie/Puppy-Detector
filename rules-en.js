/**
 * ScholaraPuppy — English Detection, Whitelist & Zero-Cost Rewrite Rules (rules-en.js)
 * Pure static JS module (no bundler required). Attaches to window.SCHOLARA_RULES.
 */
(function (global) {
    'use strict';

    function matchCase(original, replacement) {
        if (!original || !replacement) return replacement;
        if (original === original.toUpperCase() && original !== original.toLowerCase()) {
            return replacement.toUpperCase();
        }
        if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    }

    function capitalizeFirst(str) {
        if (!str) return str;
        const trimmed = str.trimStart();
        if (!trimmed) return str;
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }

    function lowerFirstIfSafe(str) {
        if (!str) return str;
        const trimmed = str.trimStart();
        if (!trimmed) return str;
        // Preserve acronyms like "AI", "DNA", "US" or standalone "I"
        if (/^(?:I\b|[A-Z]{2,})/.test(trimmed)) return trimmed;
        return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    }

    // =========================================================================
    // 1. LAYER 1 — WHOLE-CLAUSE CAPTURE-GROUP REWRITES (MEANING-PRESERVING)
    //    Runs before token-level detection so full clauses are restructured
    //    via $1/$2 capture groups rather than blindly deleting words.
    // =========================================================================
    const CLAUSE_REWRITE_RULES_EN = [
        {
            id: 'en_clause_important_note',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Formulaic Framing Clause',
            severity: 4,
            regex: /\b(?:it'?s|it is)\s+(?:important|crucial|essential|worth)\s+(?:to\s+note|noting)\s+that\s+([^.!?\n]+)/gi,
            reason: 'Formulaic lead-in clauses pad the sentence before stating the actual claim, a frequent LLM pattern.',
            suggestion: 'Restructure the clause with a concise modifier while keeping the full claim intact.',
            prevent: 'Open directly with the subject or a single concise adverb (e.g., "Notably,").',
            replacementFn: (full, p1) => {
                const lead = /^[A-Z]/.test(full.trim()) ? 'Notably, ' : 'notably, ';
                return `${lead}${lowerFirstIfSafe(p1)}`;
            }
        },
        {
            id: 'en_clause_today_landscape',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Stock Context Opener',
            severity: 4,
            regex: /\bin\s+today'?s\s+(?:rapidly\s+evolving\s+|ever-evolving\s+)?(?:world|landscape|era|age)\s+of\s+([^,.;!?\n]+)/gi,
            reason: 'Stock "In today\'s landscape of..." openers are among the strongest markers of AI-generated essays.',
            suggestion: 'Condense the generic backdrop into a direct prepositional phrase.',
            prevent: 'Anchor context with a specific time period, dataset, or field name.',
            replacementFn: (full, p1) => {
                const lead = /^[A-Z]/.test(full.trim()) ? 'In current ' : 'in current ';
                return `${lead}${p1.trim()}`;
            }
        },
        {
            id: 'en_clause_in_age_of',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Generic Era Framing',
            severity: 4,
            regex: /\bin\s+the\s+(?:age|world|era)\s+of\s+([^,.;!?\n]+)/gi,
            reason: 'Sweeping "In the age of..." openers inflate routine observations into cliché introductions.',
            suggestion: 'Replace the sweeping framing with a direct reference to the subject.',
            prevent: 'Reference the specific domain or recent period directly.',
            replacementFn: (full, p1) => {
                const lead = /^[A-Z]/.test(full.trim()) ? 'Within modern ' : 'within modern ';
                return `${lead}${p1.trim()}`;
            }
        },
        {
            id: 'en_clause_not_just_but_also',
            category: 'syntax',
            dimension: 'authenticity',
            tier: 1,
            name: 'Binary Contrast Skeleton ("not just X, but also Y")',
            severity: 5,
            regex: /\b(?:it'?s|it is)\s+not\s+just\s+(?:about\s+)?([^,.;!?\n]+?),?\s+but\s+(?:also\s+)?(?:about\s+)?([^.!?\n]+)/gi,
            reason: 'Repeated "not just X, but also Y" antithesis is a hallmark rhetorical cadence of large language models.',
            suggestion: 'Merge both halves into one direct statement so neither concept is lost.',
            prevent: 'State both factors directly instead of setting up a dramatic negative-then-positive pivot.',
            replacementFn: (full, p1, p2) => {
                const lead = /^[A-Z]/.test(full.trim()) ? 'It involves both ' : 'it involves both ';
                return `${lead}${p1.trim()} and ${p2.trim()}`;
            }
        },
        {
            id: 'en_clause_conclusion_recap',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Formulaic Conclusion Lead-In',
            severity: 4,
            regex: /(^|[.!?]\s+)((?:In conclusion|In summary|To sum up|Ultimately|Overall),\s+([^.!?\n]+))/gi,
            hasLeadingBoundary: true,
            reason: 'Predictable paragraph-closing signposts ("In conclusion,", "Ultimately,") signal template-driven AI transitions.',
            suggestion: 'Reframe the closing sentence directly around the evidence while retaining the full takeaway.',
            prevent: 'Close paragraphs with a concrete implication, boundary condition, or finding.',
            replacementFn: (matchedStr, p1, p2) => {
                const body = p2 || matchedStr.replace(/^(?:In conclusion|In summary|To sum up|Ultimately|Overall),\s*/i, '');
                return `Taken together, ${lowerFirstIfSafe(body)}`;
            }
        },
        {
            id: 'en_clause_plays_vital_role',
            category: 'syntax',
            dimension: 'trust',
            tier: 1,
            name: 'Inflated Importance Predicate',
            severity: 5,
            regex: /\bplays\s+a\s+(?:vital|pivotal|crucial|critical|key)\s+role\s+in\s+([^.!?\n]+)/gi,
            reason: '"Plays a vital/pivotal role in..." is an overused LLM filler predicate that obscures the exact causal mechanism.',
            suggestion: 'Replace the cliché predicate with a direct causal verb while preserving the object clause.',
            prevent: 'Name the concrete action (e.g., "drives", "directly shapes", "reduces", "governs").',
            replacementFn: (full, p1) => {
                return `${matchCase(full.slice(0, 5), 'directly shapes')} ${p1.trim()}`;
            }
        },
        {
            id: 'en_clause_stands_testament',
            category: 'syntax',
            dimension: 'trust',
            tier: 1,
            name: 'Grandiose Testament Framing',
            severity: 5,
            regex: /\b(?:stands|serves)\s+as\s+a\s+testament\s+to\s+([^.!?\n]+)/gi,
            reason: '"Stands as a testament to..." is a high-frequency AI puffery pattern rarely used in concise academic prose.',
            suggestion: 'Restate the relationship as direct evidence while preserving the referenced outcome.',
            prevent: 'Use plain evidential verbs like "demonstrates", "reflects", or "provides evidence of".',
            replacementFn: (full, p1) => {
                return `${matchCase(full.slice(0, 6), 'provides clear evidence of')} ${p1.trim()}`;
            }
        },
        {
            id: 'en_clause_in_order_to',
            category: 'lexicon',
            dimension: 'density',
            tier: 1,
            name: 'Wordy Purpose Infinitive',
            severity: 3,
            regex: /\bin\s+order\s+to\s+([a-z]+(?:\s+[^,.;!?\n]+)?)/gi,
            reason: '"In order to" adds two redundant words without changing the grammatical meaning of the infinitive.',
            suggestion: 'Tighten "in order to + verb" to "to + verb" with zero loss of meaning.',
            prevent: 'Use plain "to" before purpose verbs unless disambiguating complex syntax.',
            replacementFn: (full, p1) => `${matchCase(full.slice(0, 2), 'to')} ${p1}`
        }
    ];

    // =========================================================================
    // 2. CORE ENGLISH AI DETECTION RULES (ALL 13 ORIGINAL RULES PRESERVED)
    // =========================================================================
    const AI_DETECTION_RULES_EN = [
        {
            id: 'en_banned_words',
            category: 'lexicon',
            dimension: 'authenticity',
            tier: 1,
            name: 'High-Frequency AI Buzzwords',
            severity: 4,
            regex: /\b(delve|delves|delving|foster|fosters|fostering|leverage|leverages|leveraging|utilize|utilizes|utilizing|facilitate|facilitates|facilitating|empower|empowers|streamline|robust|cutting-edge|paradigm shift|game[- ]changer|this is huge|this changes everything|tapestry|realm|beacon|multifaceted|meticulous|intricate|paramount|transformative|elevate|embark|supercharge|harness|ever-evolving|vital)\b/gi,
            reason: 'This word is heavily overrepresented in LLM outputs compared to natural academic prose.',
            suggestion: 'Swap for a direct, concrete academic verb or noun (e.g., "use" instead of "utilize", "critical" instead of "paramount").',
            prevent: 'Keep a plain-English verb list (examine, measure, test, use) and avoid theatrical modifiers.',
            replacementFn: (m) => {
                const map = {
                    delve: 'examine', delves: 'examines', delving: 'examining',
                    foster: 'support', fosters: 'supports', fostering: 'supporting',
                    leverage: 'use', leverages: 'uses', leveraging: 'using',
                    utilize: 'use', utilizes: 'uses', utilizing: 'using',
                    facilitate: 'help', facilitates: 'helps', facilitating: 'helping',
                    empower: 'enable', empowers: 'enables',
                    streamline: 'simplify', robust: 'reliable', 'cutting-edge': 'modern',
                    'paradigm shift': 'major change', 'game-changer': 'turning point', 'game changer': 'turning point',
                    'this is huge': 'this result is substantial',
                    'this changes everything': 'this substantially alters prior assumptions',
                    tapestry: 'mix', realm: 'field', beacon: 'model',
                    multifaceted: 'varied', meticulous: 'careful', intricate: 'detailed',
                    paramount: 'critical', transformative: 'major', elevate: 'raise',
                    embark: 'begin', supercharge: 'speed up', harness: 'use',
                    'ever-evolving': 'changing', vital: 'key'
                };
                return matchCase(m, map[m.toLowerCase()] || 'specific');
            }
        },
        {
            id: 'en_business_jargon',
            category: 'lexicon',
            dimension: 'density',
            tier: 1,
            name: 'Corporate & Slide-Deck Jargon',
            severity: 3,
            regex: /\b(navigate\s+(?:the\s+)?challenges?|unpack|lean into|landscape|double down|deep dive|take a step back|moving forward|circle back|on the same page)\b/gi,
            reason: 'Consultancy metaphors ("landscape", "unpack", "navigate challenges") inflate tone and mimic AI blog style.',
            suggestion: 'Replace the corporate idiom with literal academic phrasing (e.g., "explain" for "unpack", "field" for "landscape").',
            prevent: 'Describe concrete actions and domain boundaries instead of boardroom metaphors.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.startsWith('navigate')) return matchCase(m, 'address challenges');
                if (lower === 'unpack') return matchCase(m, 'explain');
                if (lower === 'lean into') return matchCase(m, 'adopt');
                if (lower === 'landscape') return matchCase(m, 'field');
                if (lower === 'double down') return matchCase(m, 'increase commitment');
                if (lower === 'deep dive') return matchCase(m, 'close analysis');
                if (lower === 'take a step back') return matchCase(m, 'reassess the broader context');
                if (lower === 'moving forward') return matchCase(m, 'next');
                if (lower === 'circle back') return matchCase(m, 'revisit');
                if (lower === 'on the same page') return matchCase(m, 'aligned');
                return matchCase(m, 'focus on');
            }
        },
        {
            id: 'en_empty_adverbs',
            category: 'lexicon',
            dimension: 'density',
            tier: 1,
            name: 'Empty Intensifier Adverbs',
            severity: 2,
            regex: /\b(really|just|literally|genuinely|honestly|simply|actually|deeply|truly|fundamentally|inherently|inevitably|interestingly|importantly|crucially)\b/gi,
            reason: 'Generic intensifiers pad sentence rhythm without adding verifiable precision.',
            suggestion: 'Replace with a precise academic qualifier so the intended nuance stays intact.',
            prevent: 'Let verbs, quantities, and empirical evidence carry emphasis instead of stock adverbs.',
            replacementFn: (m) => {
                const map = {
                    really: 'markedly',
                    just: 'only',
                    literally: 'strictly',
                    genuinely: 'measurably',
                    honestly: 'candidly',
                    simply: 'directly',
                    actually: 'in practice',
                    deeply: 'strongly',
                    truly: 'clearly',
                    fundamentally: 'structurally',
                    inherently: 'by design',
                    inevitably: 'consistently',
                    interestingly: 'notably',
                    importantly: 'notably',
                    crucially: 'specifically'
                };
                return matchCase(m, map[m.toLowerCase()] || 'specifically');
            }
        },
        {
            id: 'en_filler_phrases',
            category: 'lexicon',
            dimension: 'directness',
            tier: 1,
            name: 'Padded Filler Phrases',
            severity: 4,
            regex: /\b(it'?s worth noting(?: that)?|it is worth noting(?: that)?|it'?s important to note(?: that)?|it is important to note(?: that)?|at the end of the day|when it comes to|at its core|in today'?s (?:world|landscape|era|age)|in the (?:age|world) of|in a world where|the reality is|the truth is|in terms of|with regard to|in order to|going forward|in this article|let'?s dive in)\b/gi,
            reason: 'Multi-word filler bridges delay the main clause and strongly elevate AI phrase scores.',
            suggestion: 'Swap for a compact, meaning-preserving connector or preposition.',
            prevent: 'Start clauses with the actual actor, variable, or finding rather than throat-clearing transitions.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.includes('worth noting') || lower.includes('important to note')) return matchCase(m, 'notably,');
                if (lower === 'at the end of the day') return matchCase(m, 'in practice');
                if (lower === 'when it comes to') return matchCase(m, 'regarding');
                if (lower === 'at its core') return matchCase(m, 'primarily');
                if (lower.startsWith("in today's")) return matchCase(m, 'in current practice');
                if (lower.startsWith('in the age of') || lower.startsWith('in the world of')) return matchCase(m, 'amid');
                if (lower === 'in a world where') return matchCase(m, 'in contexts where');
                if (lower === 'the reality is' || lower === 'the truth is') return matchCase(m, 'in practice,');
                if (lower === 'with regard to' || lower === 'in terms of') return matchCase(m, 'regarding');
                if (lower === 'in order to') return matchCase(m, 'to');
                if (lower === 'going forward') return matchCase(m, 'next');
                if (lower === 'in this article') return matchCase(m, 'here');
                if (lower === "let's dive in") return matchCase(m, 'the analysis begins below');
                return matchCase(m, 'specifically,');
            }
        },
        {
            id: 'en_throat_clearing',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Throat-Clearing Openers',
            severity: 5,
            hasLeadingBoundary: true,
            regex: /(^|[.!?]\s+)(Here'?s the thing:?|Here'?s (?:what|this|that|why)\b[^.!?]{0,30}:?|The uncomfortable truth is|It turns out(?: that)?|Let me be clear:?|I'?ll say it again:?|I'?m going to be honest|I'?ll be honest|Can we talk about|Here'?s what I find interesting|Here'?s the problem though)/gi,
            reason: 'Conversational announce-before-speaking openers ("Here\'s the thing:") are signature LLM blog/essay patterns.',
            suggestion: 'Replace the conversational opener with a concise analytical lead-in that preserves the turn in argument.',
            prevent: 'Open sentences directly with the substantive claim or counter-evidence.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.includes('problem')) return 'A key limitation is that';
                if (lower.includes('turns out')) return 'Evidence shows that';
                if (lower.includes('truth')) return 'In practice,';
                if (lower.includes('interesting')) return 'Notably,';
                if (lower.includes('can we talk about')) return 'Consider';
                return 'Specifically,';
            }
        },
        {
            id: 'en_faux_insight',
            category: 'syntax',
            dimension: 'trust',
            tier: 3,
            name: 'Faux-Insight Setups',
            severity: 5,
            regex: /\b(this is the part most people skip|what most people get wrong|here'?s what nobody tells you|the part everyone misses|the detail that makes it work:|the best part:)\b/gi,
            reason: 'Clickbait-style "secret insight" framing undermines academic credibility and triggers AI detectors.',
            suggestion: 'State the overlooked variable or counter-intuitive finding directly rather than hyping it.',
            prevent: 'Present surprising empirical findings plainly with data instead of dramatic buildup.',
            replacementFn: (m) => matchCase(m, 'One frequently overlooked factor is:')
        },
        {
            id: 'en_binary_contrast',
            category: 'syntax',
            dimension: 'authenticity',
            tier: 1,
            name: 'Binary Contrast Pattern ("Not X, but Y")',
            severity: 5,
            regex: /\b(?:not because [^.,!?]+[.,]\s*(?:but )?because|isn'?t the problem[.,]\s*[^.,!?]+ is|the (?:answer|question) isn'?t [^.,!?]+[.,]\s*it'?s|it'?s not just [^.,!?]+(?:,| but(?: also)?)|stops being [^.,!?]+ and starts being|doesn'?t mean [^.,!?]+,?\s*but actually)\b/gi,
            reason: 'Overusing dramatic "not X, but Y" negations creates a rhythmic fingerprint common to AI prose.',
            suggestion: 'Reframe the contrast into an affirmative synthesis that keeps both ideas clear.',
            prevent: 'Limit negative-then-positive antithesis to at most once per essay; lead with positive assertions.',
            replacementFn: (m) => {
                const parts = m.split(/\b(?:but also|but actually|but|it's|its)\b/i);
                if (parts.length > 1) {
                    const left = parts[0]
                        .replace(/^\s*(?:it'?s\s+not\s+just|not\s+because|the\s+(?:answer|question)\s+isn'?t|doesn'?t\s+mean)\s*/i, '')
                        .replace(/[,.\s]+$/, '')
                        .trim();
                    const right = parts[parts.length - 1].trim();
                    if (left && right && /not just/i.test(m)) {
                        return matchCase(m, `both ${left} and ${right}`);
                    }
                    return matchCase(m, right);
                }
                return m;
            }
        },
        {
            id: 'en_rhetorical_meta',
            category: 'syntax',
            dimension: 'trust',
            tier: 3,
            name: 'Rhetorical Crutches & Meta-Commentary',
            severity: 4,
            regex: /\b(Full stop\.|Period\.|Let that sink in\.|Make no mistake|This matters because|Here'?s why that matters|What if I told you|Think about it:|Plot twist:|Spoiler:|Hint:|And that'?s okay\.|As you can see|The key point is|This distinction matters|In this section, we'?ll|The rest of this essay explains|Let me walk you through)\b/gi,
            reason: 'Stage-directing the reader ("Let that sink in.", "As you can see") reads like synthetic commentary rather than peer prose.',
            suggestion: 'Rewrite the sentence around the logical link itself instead of narrating how the reader should react.',
            prevent: 'Connect ideas via cause-and-effect transitions rather than meta-narration.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.includes('matters because') || lower.includes('why that matters')) return matchCase(m, 'This relationship is consequential because');
                if (lower.includes('key point is')) return matchCase(m, 'Central to this finding is');
                if (lower.includes('distinction matters')) return matchCase(m, 'This distinction affects the outcome');
                if (lower.includes('in this section')) return matchCase(m, 'This section examines');
                if (lower.includes('rest of this essay')) return matchCase(m, 'The following sections examine');
                return null;
            }
        },
        {
            id: 'en_superficial_ing',
            category: 'syntax',
            dimension: 'density',
            tier: 1,
            name: 'Superficial Participle (-ing) Tag-On',
            severity: 4,
            regex: /,\s+(highlighting|underscoring|reflecting|showcasing|demonstrating|emphasizing|signaling)\s+(?:the|a|its|their)\b/gi,
            reason: 'Tacking ", underscoring the..." onto the end of sentences is a classic AI cadence for padding significance.',
            suggestion: 'Convert the trailing participle into a direct relative clause or concrete result.',
            prevent: 'Check comma + -ing endings: either convert into a specific consequence or split into a crisp follow-up sentence.',
            replacementFn: (m) => {
                const articleMatch = m.match(/\b(the|a|its|their)\b/i);
                const article = articleMatch ? articleMatch[1].toLowerCase() : 'the';
                return `, which points directly to ${article}`;
            }
        },
        {
            id: 'en_puffery_weasel',
            category: 'syntax',
            dimension: 'trust',
            tier: 3,
            name: 'Puffery & Unattributed Authority',
            severity: 5,
            regex: /\b(stands as a testament|serves as a testament|a testament to|marks a pivotal moment|plays a (?:vital|pivotal|crucial) role|solidifies its position|underscores its significance|experts agree|industry reports suggest|many argue|widely regarded as|studies show|the reasons are structural|the implications are significant|the stakes are high|the consequences are real)\b/gi,
            reason: 'Vague authority claims ("studies show", "experts agree") and inflated significance lack verifiable citations.',
            suggestion: 'Replace with a concrete causal verb or insert an actual named citation (Author, Year).',
            prevent: 'Always cite specific studies or measurements rather than appealing to unnamed consensus.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.includes('role')) return matchCase(m, 'directly shapes');
                if (lower.includes('testament')) return matchCase(m, 'evidence of');
                if (lower.includes('solidifies its position')) return matchCase(m, 'remains widely adopted');
                if (lower.includes('underscores its significance')) return matchCase(m, 'illustrates its measurable effect');
                if (lower.includes('pivotal moment')) return matchCase(m, 'marks a documented shift');
                if (lower.includes('studies show') || lower.includes('experts agree') || lower.includes('industry reports') || lower.includes('many argue') || lower.includes('widely regarded')) {
                    return null;
                }
                return null;
            }
        },
        {
            id: 'en_false_agency',
            category: 'syntax',
            dimension: 'directness',
            tier: 3,
            name: 'Inanimate False Agency',
            severity: 4,
            regex: /\b(the decision emerges|the culture shifts|the conversation moves toward|the data tells us|the market rewards|a complaint becomes a fix|a bet lives or dies)\b/gi,
            reason: 'Treating abstract concepts ("the data", "the culture") as autonomous actors hides who actually took action.',
            suggestion: 'Name the concrete human actors, researchers, or measurements performing the action.',
            prevent: 'Use active voice with real agents (researchers, participants, engineers, committees).',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.includes('data tells')) return matchCase(m, 'the measurements indicate');
                if (lower.includes('decision emerges')) return matchCase(m, 'the committee decided');
                if (lower.includes('culture shifts')) return matchCase(m, 'teams changed their practices');
                if (lower.includes('conversation moves')) return matchCase(m, 'researchers shifted focus toward');
                if (lower.includes('market rewards')) return matchCase(m, 'buyers favor');
                return null;
            }
        },
        {
            id: 'en_summary_recap',
            category: 'syntax',
            dimension: 'directness',
            tier: 1,
            name: 'Formulaic Transition or Recap Opener',
            severity: 4,
            hasLeadingBoundary: true,
            regex: /(^|[.!?]\s+)(In conclusion,|Ultimately,|Overall,|To sum up,|In summary,|Furthermore,)/gi,
            reason: 'Mechanical transition signposts ("Furthermore,", "In conclusion,") closely follow standard LLM paragraph templates.',
            suggestion: 'Swap for a lighter, more natural academic transition without losing logical flow.',
            prevent: 'Vary paragraph openings with domain nouns, contrast clauses, or data references.',
            replacementFn: (m) => {
                const lower = m.toLowerCase();
                if (lower.startsWith('furthermore')) return 'In addition,';
                return 'Taken together,';
            }
        },
        {
            id: 'en_lazy_extremes',
            category: 'lexicon',
            dimension: 'trust',
            tier: 1,
            name: 'Absolute Generalizations',
            severity: 2,
            regex: /\b(everyone|everybody|nobody|always|never)\b/gi,
            reason: 'Sweeping absolutes ("everyone", "always", "never") weaken academic rigor and appear often in generic summaries.',
            suggestion: 'Qualify the claim with realistic scope or frequency.',
            prevent: 'Specify proportions or empirical scope (e.g., "most respondents", "rarely", "in 80% of trials").',
            replacementFn: (m) => {
                const map = {
                    everyone: 'most readers',
                    everybody: 'most people',
                    nobody: 'few practitioners',
                    always: 'consistently',
                    never: 'rarely'
                };
                return matchCase(m, map[m.toLowerCase()] || 'frequently');
            }
        }
    ];

    // =========================================================================
    // 3. SAFE DETERMINISTIC REWRITE RULES (ALL ORIGINAL EN + SHARED RULES)
    // =========================================================================
    const SAFE_REWRITE_RULES_EN = [
        {
            id: 'clean_emoji_headings',
            label: 'Remove decorative emojis from headings or line starts',
            academicSafe: true,
            regex: /(^|\n)(\s*#{0,6}\s*)[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/gu,
            replace: '$1$2'
        },
        {
            id: 'clean_mid_bold',
            label: 'Remove decorative mid-sentence bold formatting',
            academicSafe: false,
            regex: /([^\n#*-]\s+)\*\*([^*\n]{2,25})\*\*(\s+[^\n])/g,
            replace: '$1$2$3'
        },
        {
            id: 'fix_en_throat_clearing',
            label: 'Remove English throat-clearing openers',
            academicSafe: true,
            regex: /(^|[.!?]\s+)(?:Here'?s the thing:\s*|Let me be clear:\s*|The uncomfortable truth is(?: that)?\s*|The truth is,\s*|The reality is(?: that)?\s*|It'?s worth noting(?: that)?\s*|It'?s important to note(?: that)?\s*|It is (?:worth|important to) (?:noting|note)(?: that)?\s*|I'?ll be honest,\s*|Let'?s dive in[.!]\s*)/gi,
            replace: '$1'
        },
        {
            id: 'fix_en_emphasis_crutches',
            label: 'Remove empty emphasis crutches',
            academicSafe: true,
            regex: /\s*(?:Full stop\.|Let that sink in\.|Make no mistake,\s*)/gi,
            replace: ' '
        },
        {
            id: 'fix_en_summary_openers',
            label: 'Replace mechanical summary openers',
            academicSafe: false,
            regex: /(^|[.!?]\s+)(?:In conclusion,\s*|Ultimately,\s*|Overall,\s*|At the end of the day,\s*)/gi,
            replace: '$1Taken together, '
        },
        {
            id: 'fix_en_banned_replacements',
            label: 'Replace AI buzzwords & corporate jargon with plain vocabulary',
            academicSafe: true,
            regex: /\b(utilize|utilizes|utilized|utilizing|leverage|leverages|leveraged|leveraging|facilitate|facilitates|facilitated|delve into|delving into|unpack|in order to|moving forward|deep dive)\b/gi,
            replace: (match) => {
                const map = {
                    'utilize': 'use', 'utilizes': 'uses', 'utilized': 'used', 'utilizing': 'using',
                    'leverage': 'use', 'leverages': 'uses', 'leveraged': 'used', 'leveraging': 'using',
                    'facilitate': 'help', 'facilitates': 'helps', 'facilitated': 'helped',
                    'delve into': 'examine', 'delving into': 'examining', 'unpack': 'explain',
                    'in order to': 'to', 'moving forward': 'next', 'deep dive': 'analysis'
                };
                const lower = match.toLowerCase();
                return matchCase(match, map[lower] || match);
            }
        },
        {
            id: 'fix_en_weak_verb_phrases',
            label: 'Replace wordy verb phrases with direct verbs',
            academicSafe: true,
            regex: /\b(made a decision to|has the ability to|have the ability to)\b/gi,
            replace: (match) => {
                const lower = match.toLowerCase();
                if (lower === 'made a decision to') return matchCase(match, 'decided to');
                return matchCase(match, 'can');
            }
        },
        {
            id: 'fix_en_empty_adverbs',
            label: 'Tighten empty intensifier adverbs',
            academicSafe: false,
            regex: /\b(?:literally|fundamentally|inherently|crucially|importantly|truly|genuinely)\s+/gi,
            replace: ''
        },
        {
            id: 'fix_em_dash_clusters',
            label: 'Convert excessive em-dash clusters into natural punctuation',
            academicSafe: true,
            regex: /\s*(?:—|——)\s*/g,
            replace: ', '
        }
    ];

    // =========================================================================
    // 4. LAYER 2 — RHYTHM & STRUCTURE SPLIT CONFIG (SENTENCE FLOW & PARAGRAPHS)
    // =========================================================================
    const FLOW_SPLIT_CONFIG_EN = {
        minSentenceUnitsToSplit: 22,
        uniformLengthTolerance: 4,
        sentenceConnectors: [
            {
                regex: /,\s+which\s+([^.!?\n]{12,})/i,
                splitFn: (left, p1) => `${left.trim()}. This ${p1.trim()}`
            },
            {
                regex: /;\s+([^.!?\n]{12,})/,
                splitFn: (left, p1) => `${left.trim()}. ${capitalizeFirst(p1)}`
            },
            {
                regex: /,\s+while\s+([^.!?\n]{12,})/i,
                splitFn: (left, p1) => `${left.trim()}. Meanwhile, ${lowerFirstIfSafe(p1)}`
            },
            {
                regex: /,\s+whereas\s+([^.!?\n]{12,})/i,
                splitFn: (left, p1) => `${left.trim()}. By contrast, ${lowerFirstIfSafe(p1)}`
            },
            {
                regex: /,\s+although\s+([^.!?\n]{12,})/i,
                splitFn: (left, p1) => `${left.trim()}. Even so, ${lowerFirstIfSafe(p1)}`
            },
            {
                regex: /,\s+and\s+([^.!?\n]{16,})/i,
                splitFn: (left, p1) => `${left.trim()}. ${capitalizeFirst(p1)}`
            },
            {
                regex: /,\s+but\s+([^.!?\n]{14,})/i,
                splitFn: (left, p1) => `${left.trim()}. However, ${lowerFirstIfSafe(p1)}`
            }
        ],
        paragraphSplitTransitions: /^(?:However|Meanwhile|In contrast|By contrast|Second|Third|On the other hand|In addition|Yet|Instead|Nevertheless|Conversely|Consequently|Furthermore)\b/i
    };

    // =========================================================================
    // 5. LAYER 3 — MANUAL REVIEW CHECKS (NEVER FABRICATE FACTS OR CITATIONS)
    // =========================================================================
    const MANUAL_REVIEW_CHECKS_EN = [
        {
            id: 'manual_weasel_en',
            name: 'Unattributed Authority (Weasel Words)',
            dimension: 'trust',
            regex: /\b(experts agree|studies show|widely regarded as|many argue|industry reports suggest)\b/gi,
            reason: 'Appealing to unnamed studies or consensus lowers trust and mimics AI filler.',
            advice: 'Insert a concrete named citation (Author, Year) or report the actual source directly; our engine will not fabricate references.'
        },
        {
            id: 'manual_false_agency_en',
            name: 'Inanimate False Agency',
            dimension: 'directness',
            regex: /\b(the decision emerges|the data tells us|the market rewards|the culture shifts|the conversation moves toward)\b/gi,
            reason: 'Abstract nouns acting on their own obscure who performed the action.',
            advice: 'Rewrite in active voice naming the specific researchers, institution, or participants responsible.'
        },
        {
            id: 'manual_vague_declaratives_en',
            name: 'Vague Declarative Claims',
            dimension: 'density',
            regex: /\b(the implications are significant|the reasons are structural|the stakes are high|the consequences are real)\b/gi,
            reason: 'Broad significance statements assert importance without specifying what actually changes.',
            advice: 'Replace the abstract adjective with a concrete mechanism, metric, or documented consequence.'
        }
    ];

    // =========================================================================
    // 6. PILLAR 3 — STEM WHITELIST & GLUE-WORD PREDICTABILITY CONFIG (100% PRESERVED)
    // =========================================================================
    const STEM_WHITELIST_EN = new Set([
        'spectrophotometry', 'spectrophotometer', 'centrifugation', 'centrifuge', 'electrophoresis',
        'chromatography', 'titration', 'molarity', 'stoichiometry', 'thermodynamics', 'enthalpy',
        'entropy', 'catalysis', 'catalyst', 'enzyme', 'enzymatic', 'substrate', 'inhibitor',
        'mitochondria', 'mitochondrial', 'cytoplasm', 'ribosome', 'nucleotide', 'polymerase',
        'transcription', 'translation', 'phosphorylation', 'glycolysis', 'photosynthesis',
        'homeostasis', 'osmosis', 'diffusion', 'gradient', 'membrane', 'phospholipid', 'protein',
        'peptide', 'amino', 'acid', 'reagent', 'aliquot', 'supernatant', 'precipitate', 'pellet',
        'pipette', 'micropipette', 'cuvette', 'absorbance', 'wavelength', 'fluorescence',
        'assay', 'incubation', 'incubated', 'buffer', 'saline', 'solution', 'concentration',
        'dilution', 'calibration', 'baseline', 'control', 'replicate', 'replicates', 'sample',
        'samples', 'specimen', 'cohort', 'placebo', 'dosage', 'biomarker', 'genotype', 'phenotype',
        'allele', 'chromosome', 'mutation', 'genome', 'sequencing', 'amplicon', 'primer', 'plasmid',
        'bacteria', 'bacterial', 'pathogen', 'antigen', 'antibody', 'cytokine', 'inflammation',
        'oxidation', 'reduction', 'redox', 'hydrolysis', 'isomer', 'polymer', 'monomer', 'covalent',
        'ionic', 'hydrogen', 'carbon', 'nitrogen', 'oxygen', 'sodium', 'potassium', 'chloride',
        'calcium', 'magnesium', 'phosphate', 'sulfate', 'ethanol', 'methanol', 'chloroform',
        'glucose', 'sucrose', 'lactose', 'starch', 'cellulose', 'adenosine', 'triphosphate',
        'velocity', 'acceleration', 'momentum', 'voltage', 'amperage', 'resistance', 'capacitance',
        'inductance', 'frequency', 'amplitude', 'resonance', 'diffraction', 'refraction', 'photon',
        'electron', 'proton', 'neutron', 'isotope', 'quantum', 'magnetic', 'electrostatic',
        'algorithm', 'heuristic', 'regression', 'variance', 'deviation', 'correlation', 'pvalue',
        'anova', 'chi-square', 'bayesian', 'stochastic', 'deterministic', 'matrix', 'vector',
        'tensor', 'backpropagation', 'convolution', 'transformer', 'tokenization',
        'latency', 'throughput', 'bandwidth', 'protocol', 'encryption', 'cryptography', 'compiler'
    ]);

    const STEM_MORPHOLOGY_REGEX_EN = /\b(?:[a-z]+(?:ase|ose|ide|ate|ite|metry|graphy|scopy|lysis|genesis|phoresis|tropism|plasia|pathy|itis|oma)|(?:bio|neuro|cardio|immuno|chemo|electro|thermo|photo|micro|nano|macro|hydro|poly|mono|iso|aero|anaero)[a-z]{3,}|(?:pcr|dna|rna|mrna|atp|adp|nadh|elisa|hplc|nmr|uv-vis|tris-hcl|edta|sds-page|pbs|dmso|ph|rpm|nm|ml|ul|mg|mm))\b/i;

    const GLUE_CONFIG_EN = {
        anchorRegex: /\b(18\d\d|19\d\d|20\d\d)\b|\([A-Z][a-z]+.*?\d{4}\)|\b(et\s+al\.|p\.\s*\d+|n\s*=\s*\d+|\d+(\.\d+)?%|\d+\s*(?:nm|mM|uL|mL|mg|rpm|°C|AU))/i,
        expressivePunctRegex: /[;—–?]/,
        nominalizationRegex: /(tion|tions|ment|ments|ity|ities|ance|ence|ization|izations)$/i,
        glueAiTermsRegex: /\b(implementation|integration|optimization|comprehensive|systematic|framework|frameworks|transformative|sustainable|equitable|stakeholders|methodologies|initiatives|mechanisms|disparities)\b/gi,
        humanizeSentenceReplacements: [
            { regex: /\bThe implementation of\s+/i, replace: 'Implementing ' },
            { regex: /\bthe implementation of\s+/gi, replace: 'implementing ' },
            { regex: /\bThe integration of\s+/i, replace: 'Integrating ' },
            { regex: /\bthe integration of\s+/gi, replace: 'integrating ' },
            { regex: /\bThe optimization of\s+/i, replace: 'Optimizing ' },
            { regex: /\bthe optimization of\s+/gi, replace: 'optimizing ' },
            { regex: /\bfacilitates the development of\b/gi, replace: 'helps build' },
            { regex: /\bin order to\b/gi, replace: 'to' }
        ]
    };

    // =========================================================================
    // 7. PILLAR 5 — LOCAL GRAMMAR HEURISTIC QUIRKS (FALLBACK)
    // =========================================================================
    const GRAMMAR_HEURISTICS_EN = [
        { regex: /\s{2,}/, weight: 1 },
        { regex: /[a-z][.!?][A-Z]/, weight: 1 },
        { regex: /\b(\w+)\s+\1\b/i, weight: 1 },
        { regex: /\bteh\b|\brecieve\b|\bseperate\b|\boccured\b|\bwich\b|\buntill\b/i, weight: 2 },
        { regex: /[,;]\s*(however|therefore|thus)\s*,/i, weight: 1 },
        { regex: /—|\.\.\.|!|\?/, weight: 1 }
    ];

    // =========================================================================
    // 8. ENGLISH SAMPLE PASSAGES & REFERENCE BENCHMARKS (100% PRESERVED)
    // =========================================================================
    const SAMPLES_EN = {
        aiEssay: {
            label: 'AI Essay',
            icon: 'ph-robot',
            text: `In today's landscape of educational technology, it is important to note that generative models delve into multifaceted learning workflows. Furthermore, institutions utilize automated grading frameworks to streamline feedback, underscoring the significance of digital transformation.

Here's the thing: it's not just about efficiency, but also about fostering equitable outcomes across diverse classrooms. Studies show that leveraging these robust methodologies plays a vital role in enhancing student engagement and solidifies its position as a game-changer.

In conclusion, the data tells us that adopting a holistic paradigm shift stands as a testament to institutional excellence. Ultimately, stakeholders must navigate these challenges in order to unlock unprecedented academic potential.`
        },
        sciLab: {
            label: 'Sci Lab',
            icon: 'ph-flask',
            text: `We measured catalase enzymatic activity in Solanum tuberosum homogenates across five pH buffers (pH 4.0 to 8.0) using UV-Vis spectrophotometry at 240 nm. Why did the pH 4.0 tube show almost no bubble formation? Denaturation strips the active site fast.

After centrifugation at 10,000 rpm for 12 minutes at 4°C, we transferred 200 uL of the supernatant into quartz cuvettes containing 15 mM hydrogen peroxide in Tris-HCl buffer (n = 3 technical replicates per treatment). Absorbance dropped sharply at pH 7.0—averaging 0.142 AU/min—whereas the boiled negative control stayed flat within instrument noise (±0.004 AU). We nearly contaminated replicate two when a micropipette tip clipped the rim, so we discarded that aliquot and repeated the titration fresh.`
        }
    };

    const REFERENCE_BENCHMARKS_EN = [
        {
            discipline: 'History & Humanities',
            aiScoreLabel: 'AI-Typical Draft (92% AI)',
            aiDraft: 'In the rapidly evolving landscape of nineteenth-century industrialization, railways played a pivotal role in transforming economic paradigms and fostering social mobility.',
            humanScoreLabel: 'Real Human Essay (2% AI)',
            humanExcerpt: 'When the Liverpool and Manchester Railway opened in 1830, freight tariffs between the port and inland mills fell by nearly a third within eighteen months (Bagwell, 1968, p. 84).',
            testText: 'When the Liverpool and Manchester Railway opened in 1830, freight tariffs between the port and inland mills fell by nearly a third within eighteen months (Bagwell, 1968, p. 84). Yet cheap coal transport did not benefit every parish equally; smaller weaving towns bypassed by the surveying engineers lost half their looms by 1845.'
        },
        {
            discipline: 'Cognitive & Computer Science',
            aiScoreLabel: 'AI-Typical Draft (96% AI)',
            aiDraft: 'Furthermore, it is crucial to recognize that transformer architectures delve into multifaceted attention mechanisms to optimize natural language understanding across diverse domains.',
            humanScoreLabel: 'Real Human Essay (4% AI)',
            humanExcerpt: 'Unlike recurrent networks that process tokens sequentially, Vaswani et al. (2017) replaced recurrence entirely with scaled dot-product self-attention—cutting training time on WMT-2014 by an order of magnitude.',
            testText: 'Unlike recurrent networks that process tokens sequentially, Vaswani et al. (2017) replaced recurrence entirely with scaled dot-product self-attention—cutting training time on WMT-2014 by an order of magnitude. Why does attention scale so cleanly? Because matrix multiplication parallelizes across GPU cores without waiting for prior hidden states.'
        }
    ];

    // =========================================================================
    // EXPORT TO GLOBAL NAMESPACE
    // =========================================================================
    global.SCHOLARA_RULES = {
        lang: 'en',
        storageKey: 'scholara_puppy_last_5_en_v4',
        languageToolCode: 'en-US',
        matchCase,
        capitalizeFirst,
        lowerFirstIfSafe,
        clauseRewriteRules: CLAUSE_REWRITE_RULES_EN,
        detectionRules: AI_DETECTION_RULES_EN,
        safeRewriteRules: SAFE_REWRITE_RULES_EN,
        flowSplitConfig: FLOW_SPLIT_CONFIG_EN,
        manualReviewChecks: MANUAL_REVIEW_CHECKS_EN,
        stemWhitelist: {
            words: STEM_WHITELIST_EN,
            morphologyRegex: STEM_MORPHOLOGY_REGEX_EN
        },
        glueConfig: GLUE_CONFIG_EN,
        grammarHeuristics: GRAMMAR_HEURISTICS_EN,
        samples: SAMPLES_EN,
        referenceBenchmarks: REFERENCE_BENCHMARKS_EN
    };
})(window);