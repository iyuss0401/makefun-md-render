/**
 * parse.js — drop-in replacement for marked 18.1.3 (default options: gfm true,
 * breaks false, pedantic false, async false).
 *
 * A dependency-free fork of marked 18.1.3 (MIT; github.com/markedjs/marked,
 * tag v18.1.3) stripped to the GFM default path: no extensions, hooks, async,
 * pedantic, breaks or silent handling, no option plumbing, no token-type
 * dispatch overhead. Semantics are marked's own — where marked departs from
 * the CommonMark or GFM spec, this file departs the same way.
 *
 * Copyright (c) 2018-2026, MarkedJS. (MIT License)
 * Copyright (c) 2011-2018, Christopher Jeffrey. (MIT License)
 * https://github.com/markedjs/marked
 *
 * Modifications copyright the markdown-render-speed-02 entry. MIT License.
 */

const noopTest = { exec: () => null };

function cachedIndentRegex(createRegex) {
  const cache = [];
  return (indent) => {
    const cacheIndex = Math.max(0, Math.min(3, indent - 1));
    let regex = cache[cacheIndex];
    if (!regex) {
      regex = createRegex(cacheIndex);
      cache[cacheIndex] = regex;
    }
    return regex;
  };
}

function edit(regex, opt = '') {
  let source = typeof regex === 'string' ? regex : regex.source;
  const obj = {
    replace: (name, val) => {
      let valSource = typeof val === 'string' ? val : val.source;
      valSource = valSource.replace(caret, '$1');
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex: () => new RegExp(source, opt),
  };
  return obj;
}

const supportsLookbehind = true; // Node 22 supports lookbehind
const caret = /(^|[^\[])\^/g;

// ---------------------------------------------------------------------------
// other
// ---------------------------------------------------------------------------

const other = {
  codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  endingSpaceTabChar: /[ \t]$/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  leadingSpaceTab: /^[ \t]+/,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  blockquoteMarkerWhitespace: /^( {0,3}>)([ \t]+)/gm,
  listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
  listIsTask: /^\[[ xX]\][ \t]+\S/,
  listReplaceTask: /^\[[ xX]\][ \t]+/,
  listTaskCheckbox: /\[[ xX]\]/,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /[:|]/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
  endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,
  numericCharacterReferenceOrAmpersand: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  percentDecode: /%25/g,
  findPipe: /\|/g,
  splitPipe: / \|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  listItemRegex: (bull) => new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`),
  nextBulletRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`)),
  hrRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`)),
  fencesBeginRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}(?:\`\`\`|~~~)`)),
  headingBeginRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}#{1,6}(?:\\s|$)`)),
  htmlBeginRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}(?:</?(?:${_tag})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i')),
  blockquoteBeginRegex: cachedIndentRegex((indent) => new RegExp(`^ {0,${indent}}>`)),
};

// ---------------------------------------------------------------------------
// Block-level grammar (GFM)
// ---------------------------------------------------------------------------

const newline = /^(?:[ \t]*(?:\n|$))+/;
const blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const bullet = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/;
const lheadingGfm = edit(lheadingCore)
  .replace(/bull/g, bullet)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\\:\- ]*\n/)
  .getRegex();
const _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const blockText = /^[^\n]+/;
const _blockLabel = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .replace('label', _blockLabel)
  .replace('title', /(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/)
  .getRegex();

const list = edit(/^(bull)([ \t][^\n]*?)?(?:\n|$)/)
  .replace(/bull/g, bullet)
  .getRegex();

const _tag = 'address|article|aside|base|basefont|blockquote|body|caption'
  + '|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption'
  + '|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe'
  + '|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option'
  + '|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title'
  + '|tr|track|ul';
const _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const html = edit(
  '^ {0,3}(?:'
  + '<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)'
  + '|comment[^\\n]*(\\n+|$)'
  + '|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)'
  + '|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)'
  + '|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)'
  + '|</?(tag)(?:[ \t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)'
  + '|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)'
  + '|</[a-z][a-z0-9-]*\\s*>(?=[ \t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)'
  + ')', 'i')
  .replace('comment', _comment)
  .replace('tag', _tag)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
  .getRegex();

const blockquoteParagraph = edit(_paragraph)
  .replace('hr', hr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('|table', '')
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', / {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/)
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', _tag)
  .getRegex();

const blockquote = edit(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/)
  .replace('paragraph', blockquoteParagraph)
  .getRegex();

const gfmTable = edit(
  '^ *([^\\n ].*)\\n'
  + ' {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)'
  + '(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)')
  .replace('hr', hr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('blockquote', ' {0,3}>')
  .replace('code', '(?: {4}| {0,3}\t)[^\\n]')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \t]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', _tag)
  .getRegex();

const paragraphGfm = edit(_paragraph)
  .replace('hr', hr)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('table', gfmTable)
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', _tag)
  .getRegex();

// ---------------------------------------------------------------------------
// Inline grammar (GFM)
// ---------------------------------------------------------------------------

const escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/;
const inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const br = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;

const _punctuation = /[\p{P}\p{S}]/u;
const _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
const _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;
const punctuation = edit(/^((?![*_])punctSpace)/, 'u')
  .replace(/punctSpace/g, _punctuationOrSpace).getRegex();

const _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
const _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
const _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;

const blockSkip = edit(/link|precode-code|html/, 'g')
  .replace('link', /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\(\)]|\((?:\\[\s\S]|[^\(\)])*\))*\)/)
  .replace('precode-', supportsLookbehind ? '(?<!`)()' : '(^^|[^`])')
  .replace('code', /(?<b>`+)[^`]+\k<b>(?!`)/)
  .replace('html', /<(?! )[^<>]*?>/)
  .getRegex();

const emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
const emStrongLDelim = edit(emStrongLDelimCore, 'u')
  .replace(/punct/g, _punctuationGfmStrongEm)
  .getRegex();

const emStrongRDelimAstCore =
  '^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)'
  + '|[^*]+(?=[^*])'
  + '|(?!\\*)punct(\\*+)(?=[\\s]|$)'
  + '|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)'
  + '|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)'
  + '|[\\s](\\*+)(?!\\*)(?=punct)'
  + '|(?!\\*)punct(\\*+)(?!\\*)(?=punct)'
  + '|notPunctSpace(\\*+)(?=notPunctSpace)';
const emStrongRDelimAst = edit(emStrongRDelimAstCore, 'gu')
  .replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm)
  .replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm)
  .replace(/punct/g, _punctuationGfmStrongEm)
  .getRegex();

const emStrongRDelimUnd = edit(
  '^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)'
  + '|[^_]+(?=[^_])'
  + '|(?!_)punct(_+)(?=[\\s]|$)'
  + '|notPunctSpace(_+)(?!_)(?=punctSpace|$)'
  + '|(?!_)punctSpace(_+)(?=notPunctSpace)'
  + '|[\\s](_+)(?!_)(?=punct)'
  + '|(?!_)punct(_+)(?!_)(?=punct)', 'gu')
  .replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm)
  .replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm)
  .replace(/punct/g, _punctuationGfmStrongEm)
  .getRegex();

const delLDelim = edit(/^~~?(?:((?!~)punct)|[^\s~])/, 'u')
  .replace(/punct/g, _punctuation)
  .getRegex();

const delRDelimCore =
  '^[^~]+(?=[^~])'
  + '|(?!~)punct(~~?)(?=[\\s]|$)'
  + '|notPunctSpace(~~?)(?!~)(?=punctSpace|$)'
  + '|(?!~)punctSpace(~~?)(?=notPunctSpace)'
  + '|[\\s](~~?)(?!~)(?=punct)'
  + '|(?!~)punct(~~?)(?!~)(?=punct)'
  + '|notPunctSpace(~~?)(?=notPunctSpace)';
const delRDelim = edit(delRDelimCore, 'gu')
  .replace(/notPunctSpace/g, _notPunctuationOrSpace)
  .replace(/punctSpace/g, _punctuationOrSpace)
  .replace(/punct/g, _punctuation)
  .getRegex();

const anyPunctuation = edit(/\\(punct)/, 'gu')
  .replace(/punct/g, /[\p{P}\p{S}]/u)
  .getRegex();

const anyPunctuationOutsideCode = edit(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu')
  .replace(/punct/g, /[\p{P}\p{S}]/u)
  .getRegex();

const autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
  .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/)
  .getRegex();

const _inlineComment = edit(_comment).replace('(?:-->|$)', '-->').getRegex();
const tag = edit(
  '^comment'
  + '|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>'
  + '|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>'
  + '|^<\\?[\\s\\S]*?\\?>'
  + '|^<![a-zA-Z]+\\s[\\s\\S]*?>'
  + '|^<!\\[CDATA\\[[\\s\\S]*?\\]>')
  .replace('comment', _inlineComment)
  .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/)
  .getRegex();

const _inlineLabelBrackets = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const _inlineLabel = edit(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/)
  .replace('brackets', _inlineLabelBrackets)
  .getRegex();

const link = edit(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .replace('label', _inlineLabel)
  .replace('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .replace('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/)
  .getRegex();

const reflink = edit(/^!?\[(label)\]\[(ref)\]/)
  .replace('label', _inlineLabel)
  .replace('ref', _blockLabel)
  .getRegex();

const nolink = edit(/^!?\[(ref)\](?:\[\])?/)
  .replace('ref', _blockLabel)
  .getRegex();

const _boundedBlockLabel = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const _boundedInlineLabel = edit(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/)
  .replace('brackets', _inlineLabelBrackets)
  .getRegex();

const reflinkSearch = edit('reflink|nolink(?!\\()', 'g')
  .replace('reflink', edit(/^!?\[(label)\]\[(ref)\]/)
    .replace('label', _boundedInlineLabel)
    .replace('ref', _boundedBlockLabel)
    .getRegex())
  .replace('nolink', edit(/^!?\[(ref)\](?:\[\])?/)
    .replace('ref', _boundedBlockLabel)
    .getRegex())
  .getRegex();

const _caseInsensitiveProtocol = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const _extendedEmail = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const _extendedEmailProtocol = edit(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/)
  .replace(/email/g, _extendedEmail)
  .getRegex();

const url = edit(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .replace('emailProtocol', _extendedEmailProtocol)
  .replace('protocol', _caseInsensitiveProtocol)
  .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/)
  .getRegex();

const backpedal = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const del = /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/;
const textGfm = edit(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .replace('protocol', _caseInsensitiveProtocol)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', supportsLookbehind ? '(?<![^\\s*_~(])www\\.' : 'www\\.')
  .getRegex();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const escapeReplacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const getEscapeReplacement = (ch) => escapeReplacements[ch];

function escapeHtmlEntities(htmlStr, encode) {
  if (encode) {
    if (other.escapeTest.test(htmlStr)) {
      return htmlStr.replace(other.escapeReplace, getEscapeReplacement);
    }
  } else {
    if (other.escapeTestNoEncode.test(htmlStr)) {
      return htmlStr.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
    }
  }
  return htmlStr;
}

function decodeNumericCharacterReferences(text) {
  if (!other.numericCharacterReference.test(text)) {
    return text;
  }
  return text.replace(other.numericCharacterReferenceOrAmpersand, (ref, dec, hex) => {
    if (dec === undefined && hex === undefined) {
      return '&amp;';
    }
    const code = dec === undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return '\uFFFD';
    }
    return code === 38 ? '&amp;' : String.fromCodePoint(code);
  });
}

function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(other.percentDecode, '%');
  } catch {
    return null;
  }
  return href;
}

function splitCells(tableRow, count) {
  const row = tableRow.replace(other.findPipe, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === '\\') escaped = !escaped;
    if (escaped) {
      return '|';
    }
    return ' |';
  });
  const cells = row.split(other.splitPipe);
  let i = 0;

  if (!cells[0].trim()) {
    cells.shift();
  }
  if (cells.length > 0 && !cells[cells.length - 1]?.trim()) {
    cells.pop();
  }

  if (count) {
    if (cells.length > count) {
      cells.splice(count);
    } else {
      while (cells.length < count) cells.push('');
    }
  }

  for (; i < cells.length; i++) {
    cells[i] = cells[i].trim().replace(other.slashPipe, '|');
  }
  return cells;
}

function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) {
    return '';
  }
  let suffLen = 0;
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }
  return str.slice(0, l - suffLen);
}

function trimTrailingBlankLines(str) {
  const lines = str.split('\n');
  let end = lines.length - 1;
  while (end >= 0 && other.blankLine.test(lines[end])) {
    end--;
  }
  if (lines.length - end <= 2) {
    return str;
  }
  return lines.slice(0, end + 1).join('\n');
}

function normalizeLabel(label) {
  return label.trim().replace(other.multipleSpaceGlobal, ' ').toLowerCase().toUpperCase().toLowerCase();
}

function findClosingBracket(str, b) {
  if (str.indexOf(b[0]) === -1 && str.indexOf(b[1]) === -1) {
    return -1;
  }
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') {
      i++;
    } else if (str[i] === b[0]) {
      level++;
    } else if (str[i] === b[1]) {
      level--;
      if (level < 0) {
        return i;
      }
    }
  }
  if (level > 0) {
    return -2;
  }
  return -1;
}

function expandTabs(line, indent = 0) {
  let col = indent;
  let expanded = '';
  for (const char of line) {
    if (char === '\t') {
      const added = 4 - (col % 4);
      expanded += ' '.repeat(added);
      col += added;
    } else {
      expanded += char;
      col++;
    }
  }
  return expanded;
}

const emStrongDelCloserHintStacks = new WeakMap();
const itemRegexCache = new Map(); // regexes only — no case data crosses calls

function scanLastPossibleEmStrongDelClosers(src) {
  const lastPossibleEmStrongCloserIndex = { '*': -1, _: -1 };
  let lastPossibleDelCloserIndex = -1;
  const len = src.length;
  for (let i = 0; i < len; i++) {
    const ch = src[i];
    if (ch !== '*' && ch !== '_' && ch !== '~') {
      continue;
    }
    const prev = i === 0 ? '\n' : src[i - 1];
    let j = i + 1;
    while (j < len && src[j] === ch) {
      j++;
    }
    if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r' && prev !== '\f') {
      if (ch === '~') {
        lastPossibleDelCloserIndex = i;
      } else {
        lastPossibleEmStrongCloserIndex[ch] = i;
      }
    }
    i = j - 1;
  }
  return {
    maskedSrc: src,
    lastPossibleEmStrongCloserIndex,
    lastPossibleDelCloserIndex,
  };
}

function beginEmStrongDelCloserScan(tokenizer, maskedSrc) {
  const frame = scanLastPossibleEmStrongDelClosers(maskedSrc);
  const stack = emStrongDelCloserHintStacks.get(tokenizer);
  if (stack) {
    stack.push(frame);
  } else {
    emStrongDelCloserHintStacks.set(tokenizer, [frame]);
  }
}

function endEmStrongDelCloserScan(tokenizer) {
  const stack = emStrongDelCloserHintStacks.get(tokenizer);
  if (!stack) {
    return;
  }
  stack.pop();
  if (stack.length === 0) {
    emStrongDelCloserHintStacks.delete(tokenizer);
  }
}

function cachedLastPossibleEmStrongCloserIndex(tokenizer, maskedSrc, delim) {
  const frame = emStrongDelCloserHintStacks.get(tokenizer)?.[emStrongDelCloserHintStacks.get(tokenizer).length - 1];
  if (frame && frame.maskedSrc === maskedSrc) {
    return frame.lastPossibleEmStrongCloserIndex[delim];
  }
  return scanLastPossibleEmStrongDelClosers(maskedSrc).lastPossibleEmStrongCloserIndex[delim];
}

function cachedLastPossibleDelCloserIndex(tokenizer, maskedSrc) {
  const stack = emStrongDelCloserHintStacks.get(tokenizer);
  const frame = stack ? stack[stack.length - 1] : undefined;
  if (frame && frame.maskedSrc === maskedSrc) {
    return frame.lastPossibleDelCloserIndex;
  }
  return scanLastPossibleEmStrongDelClosers(maskedSrc).lastPossibleDelCloserIndex;
}

// ---------------------------------------------------------------------------
// Lexer state shared with the tokenizer
// ---------------------------------------------------------------------------

const lexerState = {
  inLink: false,
  inRawBlock: false,
  linkEmitted: false,
  linkParenPossible: true,
  top: true,
};
let tokensLinks = Object.create(null);
let inlineQueue = [];
const tokenizerObj = {}; // key for the hint stack; one global parse at a time

function infiniteLoopError(byte) {
  throw new Error('Infinite loop on byte: ' + byte);
}

function outputLink(cap, linkInfo, raw) {
  const href = linkInfo.href;
  const title = linkInfo.title || null;
  const text = cap[1].replace(other.outputLinkReplace, '$1');
  const isImage = cap[0].charAt(0) === '!';

  const outerInLink = lexerState.inLink;
  const outerLinkEmitted = lexerState.linkEmitted;
  const outerInRawBlock = lexerState.inRawBlock;
  lexerState.inLink = true;
  lexerState.linkEmitted = false;
  const tokens = inlineTokens(text);
  const textHasLink = lexerState.linkEmitted;
  lexerState.linkEmitted = outerLinkEmitted;
  lexerState.inLink = outerInLink;

  if (!isImage) {
    if (textHasLink) {
      lexerState.inRawBlock = outerInRawBlock;
      return undefined;
    }
    lexerState.linkEmitted = true;
  }

  return {
    type: isImage ? 'image' : 'link',
    raw,
    href,
    title,
    text,
    tokens,
  };
}

function indentCodeCompensation(raw, text) {
  const matchIndentToCode = raw.match(other.indentCodeCompensation);
  if (matchIndentToCode === null) {
    return text;
  }
  const indentToCode = matchIndentToCode[1];
  return text
    .split('\n')
    .map((node) => {
      const matchIndentInNode = node.match(other.beginningSpace);
      if (matchIndentInNode === null) {
        return node;
      }
      const indentInNode = matchIndentInNode[0];
      return node.slice(Math.min(indentInNode.length, indentToCode.length));
    })
    .join('\n');
}

function isLabelEndInsideToken(src, label, labelStart) {
  if (!label.includes('<')) {
    return false;
  }
  for (let i = 0; i < label.length; i++) {
    if (label[i] === '\\') {
      i++;
      continue;
    }
    if (label[i] === '`') {
      const code = inlineCode.exec(label.slice(i));
      if (code) {
        i += code[0].length - 1;
        continue;
      }
    }
    if (label[i] !== '<') {
      continue;
    }
    const tokenSrc = src.slice(labelStart + i);
    const token = tag.exec(tokenSrc) || autolink.exec(tokenSrc);
    if (!token) {
      continue;
    }
    if (token[0].length > label.length - i) {
      return true;
    }
    i += token[0].length - 1;
  }
  return false;
}

function linkInText(text) {
  if (!text.includes('[')) {
    return false;
  }
  for (const match of text.matchAll(blockSkip)) {
    if (link.test(match[0]) && text.charAt(match.index - 1) !== '!') {
      return true;
    }
  }
  for (const match of text.matchAll(reflinkSearch)) {
    const match0 = match[0];
    const refStart = match0.lastIndexOf('[');
    if (match0.charAt(0) === '!' || !Object.hasOwn(tokensLinks, normalizeLabel(match0.slice(refStart + 1, -1)))) {
      continue;
    }
    if (refStart > 1 && linkInText(match0.slice(1, refStart - 1))) {
      continue;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tokenizers (block)
// ---------------------------------------------------------------------------

function tokSpace(src) {
  const cap = newline.exec(src);
  if (cap && cap[0].length > 0) {
    return { type: 'space', raw: cap[0] };
  }
}

function tokCode(src) {
  const c0 = src.charCodeAt(0);
  if (c0 !== 32 && c0 !== 9) return undefined;
  const cap = blockCode.exec(src);
  if (cap) {
    const raw = trimTrailingBlankLines(cap[0]);
    const text = raw.replace(other.codeRemoveIndent, '');
    return { type: 'code', raw, codeBlockStyle: 'indented', text };
  }
}

function tokFences(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  const c0 = src.charCodeAt(k);
  if (c0 !== 96 && c0 !== 126) return undefined;
  const cap = fences.exec(src);
  if (cap) {
    const raw = cap[0];
    const text = indentCodeCompensation(raw, cap[3] || '');
    return {
      type: 'code',
      raw,
      lang: cap[2] ? cap[2].trim().replace(anyPunctuation, '$1') : cap[2],
      text,
    };
  }
}

function tokHeading(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  if (src.charCodeAt(k) !== 35) return undefined;
  const cap = heading.exec(src);
  if (cap) {
    let text = cap[2].trim();
    if (other.endingHash.test(text)) {
      const trimmed = rtrim(text, '#');
      if (!trimmed || other.endingSpaceTabChar.test(trimmed)) {
        text = trimmed.trim();
      }
    }
    return {
      type: 'heading',
      raw: rtrim(cap[0], '\n'),
      depth: cap[1].length,
      text,
      tokens: lexInlineQueue(text),
    };
  }
}

function tokHr(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  const c0 = src.charCodeAt(k);
  if (c0 !== 45 && c0 !== 95 && c0 !== 42) return undefined;
  const cap = hr.exec(src);
  if (cap) {
    return { type: 'hr', raw: rtrim(cap[0], '\n') };
  }
}

function tokBlockquote(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  if (src.charCodeAt(k) !== 62) return undefined;
  const cap = blockquote.exec(src);
  if (cap) {
    let lines = rtrim(cap[0], '\n').split('\n');
    let raw = '';
    let text = '';
    const tokens = [];

    while (lines.length > 0) {
      let inBlockquote = false;
      const currentLines = [];

      let i;
      for (i = 0; i < lines.length; i++) {
        const l = lines[i];
        let q = 0;
        while (q < 4 && l.charCodeAt(q) === 32) q++;
        if (q < 4 && l.charCodeAt(q) === 62) {
          currentLines.push(l);
          inBlockquote = true;
        } else if (!inBlockquote) {
          currentLines.push(l);
        } else {
          break;
        }
      }
      lines = lines.slice(i);

      const currentRaw = currentLines.join('\n');
      const currentText = currentRaw
        .replace(
          other.blockquoteMarkerWhitespace,
          (_, marker, whitespace) => marker + expandTabs(whitespace, marker.length)
        )
        .replace(other.blockquoteSetextReplace, '\n    $1')
        .replace(other.blockquoteSetextReplace2, '');
      raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
      text = text ? `${text}\n${currentText}` : currentText;

      const top = lexerState.top;
      lexerState.top = true;
      blockTokens(currentText, tokens, true);
      lexerState.top = top;

      if (lines.length === 0) {
        break;
      }

      const lastToken = tokens[tokens.length - 1];

      if (lastToken?.type === 'code' || lastToken?.type === 'heading' || lastToken?.type === 'hr' || lastToken?.type === 'html' || lastToken?.type === 'table') {
        break;
      } else if (lastToken?.type === 'blockquote') {
        const oldToken = lastToken;
        const continuation = lines.join('\n');
        const newText = oldToken.raw + '\n' + continuation.replace(other.blockquoteSetextReplace2, '');
        const newToken = tokBlockquote(newText);
        tokens[tokens.length - 1] = newToken;

        const leftover = newText.substring(newToken.raw.length).replace(/^\n/, '');
        const leftoverCount = leftover ? leftover.split('\n').length : 0;
        const consumed = leftoverCount ? lines.slice(0, -leftoverCount) : lines;
        if (consumed.length > 0) {
          raw = `${raw}\n${consumed.join('\n')}`;
        }
        text = text.substring(0, text.length - oldToken.text.length) + newToken.text;

        lines = lines.slice(consumed.length);
        if (lines.length > 0 && other.blockquoteStart.test(lines[0])) {
          continue;
        }
        break;
      } else if (lastToken?.type === 'list') {
        const oldToken = lastToken;
        const newText = oldToken.raw + '\n' + lines.join('\n');
        const newToken = tokList(newText);
        tokens[tokens.length - 1] = newToken;

        const consumedCount = newToken.raw.length > oldToken.raw.length
          ? newText.slice(oldToken.raw.length + 1, newToken.raw.length).split('\n').length
          : 0;
        if (consumedCount > 0) {
          const consumed = lines.slice(0, consumedCount).join('\n');
          raw = `${raw}\n${consumed}`;
          text = `${text}\n${consumed}`;
        }
        lines = lines.slice(consumedCount);
        continue;
      }
    }

    return { type: 'blockquote', raw, tokens, text };
  }
}

function tokList(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  const lc = src.charCodeAt(k);
  const isBullet = lc === 45 || lc === 43 || lc === 42;
  const isOrdered = lc >= 48 && lc <= 57;
  if (!isBullet && !isOrdered) return undefined;
  let cap = list.exec(src);
  if (cap) {
    const listSrc = src;
    const taken = () => listSrc.length - src.length;
    let bull = cap[1].trim();
    const isordered = bull.length > 1;

    const listToken = {
      type: 'list',
      raw: '',
      ordered: isordered,
      start: isordered ? +bull.slice(0, -1) : '',
      loose: false,
      items: [],
    };

    bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;

    let itemRegex = itemRegexCache.get(bull);
    if (itemRegex === undefined) {
      itemRegex = other.listItemRegex(bull);
      itemRegexCache.set(bull, itemRegex);
    }
    let endsWithBlankLine = false;
    while (src) {
      let endEarly = false;
      let itemContents = '';
      if (!(cap = itemRegex.exec(src))) {
        break;
      }

      if (/^ {0,3}[-_*]/.test(src) && hr.test(src)) {
        break;
      }

      const itemStart = taken();
      src = src.substring(cap[0].length);

      const firstLine = cap[2].split('\n', 1)[0];
      const bulletIndent = cap[1].length;
      let line = firstLine.indexOf('\t') === -1
        ? firstLine
        : firstLine.replace(other.leadingSpaceTab, (whitespace) => expandTabs(whitespace, bulletIndent));
      let nlOuter = src.indexOf('\n');
      let nextLine = nlOuter === -1 ? src : src.slice(0, nlOuter);
      let blankLine = !line.trim();

      let indent = 0;
      if (blankLine) {
        indent = bulletIndent + 1;
      } else {
        indent = line.search(other.nonSpaceChar);
        indent = indent > 4 ? 1 : indent;
        itemContents = line.slice(indent);
        indent += bulletIndent;
      }

      if (blankLine && other.blankLine.test(nextLine)) {
        src = src.substring(nextLine.length + 1);
        endEarly = true;
      }

      if (!endEarly) {
        const nextBulletRegex = other.nextBulletRegex(indent);
        const hrRegex = other.hrRegex(indent);
        const fencesBeginRegex = other.fencesBeginRegex(indent);
        const headingBeginRegex = other.headingBeginRegex(indent);
        const htmlBeginRegex = other.htmlBeginRegex(indent);
        const blockquoteBeginRegex = other.blockquoteBeginRegex(indent);

        while (src) {
          let nlIdx = src.indexOf('\n');
          const rawLine = nlIdx === -1 ? src : src.slice(0, nlIdx);
          let nextLineWithoutTabs;
          nextLine = rawLine;

          nextLineWithoutTabs = nextLine.indexOf('\t') === -1
            ? nextLine
            : nextLine.replace(other.leadingSpaceTab, (whitespace) => expandTabs(whitespace));

          // cheap first-non-space-char filter before the six anchored regexes
          let fc = 0;
          const lnLen = nextLine.length;
          while (fc < lnLen && nextLine.charCodeAt(fc) === 32) fc++;
          const fcc = fc < lnLen ? nextLine.charCodeAt(fc) : -1;
          // possible starts: ` ~ # < > * + - _ digits
          const couldMatch = fcc === 96 || fcc === 126 || fcc === 35 || fcc === 60 || fcc === 62 ||
            fcc === 42 || fcc === 43 || fcc === 45 || fcc === 95 || (fcc >= 48 && fcc <= 57);
          if (couldMatch) {
            if (nextBulletRegex.test(nextLine)) {
              break;
            }
            if (fencesBeginRegex.test(nextLine)) {
              break;
            }
            if (headingBeginRegex.test(nextLine)) {
              break;
            }
            if (htmlBeginRegex.test(nextLine)) {
              break;
            }
            if (blockquoteBeginRegex.test(nextLine)) {
              break;
            }
            if (hrRegex.test(nextLine)) {
              break;
            }
          }

          if (nextLineWithoutTabs.search(other.nonSpaceChar) >= indent || !nextLine.trim()) {
            itemContents += '\n' + nextLineWithoutTabs.slice(indent);
          } else {
            if (blankLine) {
              break;
            }
            if (line.replace(other.tabCharGlobal, '    ').search(other.nonSpaceChar) >= 4) {
              break;
            }
            if (fencesBeginRegex.test(line)) {
              break;
            }
            if (headingBeginRegex.test(line)) {
              break;
            }
            if (htmlBeginRegex.test(line)) {
              break;
            }
            if (hrRegex.test(line)) {
              break;
            }

            const setextContinuation =
              /^ {0,3}(?:=+|-+) *$/.test(nextLine)
              && lheadingGfm.test(`${line}\n${nextLine}`);
            const continuation = setextContinuation
              ? `    ${nextLineWithoutTabs.replace(/^ {0,3}/, '')}`
              : nextLine;
            itemContents += '\n' + continuation;
          }

          blankLine = !nextLine.trim();

          src = nlIdx === -1 ? '' : src.substring(rawLine.length + 1);
          line = nextLineWithoutTabs.slice(indent);
        }
      }

      const raw = listSrc.slice(itemStart, taken());

      if (!listToken.loose) {
        if (endsWithBlankLine) {
          listToken.loose = true;
        } else if (other.doubleBlankLine.test(raw)) {
          endsWithBlankLine = true;
        }
      }

      listToken.items.push({
        type: 'list_item',
        raw,
        task: other.listIsTask.test(itemContents),
        loose: false,
        text: itemContents,
        tokens: [],
      });
    }

    const lastItem = listToken.items[listToken.items.length - 1];
    if (lastItem) {
      lastItem.raw = lastItem.raw.trimEnd();
      lastItem.text = lastItem.text.trimEnd();
    } else {
      return undefined;
    }
    listToken.raw = listSrc.slice(0, taken()).trimEnd();

    for (const item of listToken.items) {
      lexerState.top = false;
      item.tokens = blockTokens(item.text, []);

      if (!listToken.loose) {
        const spacers = item.tokens.filter((t) => t.type === 'space');
        const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => other.anyLine.test(t.raw));
        listToken.loose = hasMultipleLineBreaks;
      }
    }

    for (const item of listToken.items) {
      const itemToken = item.tokens[0];
      if (item.task && (itemToken?.type === 'text' || itemToken?.type === 'paragraph')) {
        item.text = item.text.replace(other.listReplaceTask, '');
        itemToken.raw = itemToken.raw.replace(other.listReplaceTask, '');
        itemToken.text = itemToken.text.replace(other.listReplaceTask, '');
        for (let i = inlineQueue.length - 1; i >= 0; i--) {
          if (other.listIsTask.test(inlineQueue[i].src)) {
            inlineQueue[i].src = inlineQueue[i].src.replace(other.listReplaceTask, '');
            break;
          }
        }

        const taskRaw = other.listTaskCheckbox.exec(item.raw);
        if (taskRaw) {
          const checkboxToken = {
            type: 'checkbox',
            raw: taskRaw[0] + ' ',
            checked: taskRaw[0] !== '[ ]',
          };
          item.checked = checkboxToken.checked;
          if (listToken.loose) {
            if (item.tokens[0] && ['paragraph', 'text'].includes(item.tokens[0].type) && 'tokens' in item.tokens[0] && item.tokens[0].tokens) {
              item.tokens[0].raw = checkboxToken.raw + item.tokens[0].raw;
              item.tokens[0].text = checkboxToken.raw + item.tokens[0].text;
              item.tokens[0].tokens.unshift(checkboxToken);
            } else {
              item.tokens.unshift({
                type: 'paragraph',
                raw: checkboxToken.raw,
                text: checkboxToken.raw,
                tokens: [checkboxToken],
              });
            }
          } else {
            item.tokens.unshift(checkboxToken);
          }
        }
      } else if (item.task) {
        item.task = false;
      }
    }

    if (listToken.loose) {
      for (const item of listToken.items) {
        item.loose = true;
        for (const token of item.tokens) {
          if (token.type === 'text') {
            token.type = 'paragraph';
          }
        }
      }
    }

    return listToken;
  }
}

function tokHtml(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  if (src.charCodeAt(k) !== 60) return undefined;
  const cap = html.exec(src);
  if (cap) {
    const raw = trimTrailingBlankLines(cap[0]);
    return { type: 'html', block: true, raw, pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style', text: raw };
  }
}

function tokDef(src) {
  let k = 0;
  while (k < 4 && src.charCodeAt(k) === 32) k++;
  if (src.charCodeAt(k) !== 91) return undefined; // '['
  const cap = def.exec(src);
  if (cap) {
    if (!other.startAngleBracket.test(cap[2]) && findClosingBracket(cap[2], '()') !== -1) {
      return undefined;
    }
    const tagKey = normalizeLabel(cap[1]);
    const href = cap[2] ? cap[2].replace(other.hrefBrackets, '$1').replace(anyPunctuation, '$1') : '';
    const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(anyPunctuation, '$1') : cap[3];
    return { type: 'def', tag: tagKey, raw: rtrim(cap[0], '\n'), href, title };
  }
}

function tokTable(src) {
  if (src.indexOf('\n') === -1) return undefined;
  const cap = gfmTable.exec(src);
  if (!cap) {
    return undefined;
  }
  if (!other.tableDelimiter.test(cap[2])) {
    return undefined;
  }

  const headers = splitCells(cap[1]);
  const aligns = cap[2].replace(other.tableAlignChars, '').split('|');
  const rows = cap[3]?.trim() ? cap[3].replace(other.tableRowBlankLine, '').split('\n') : [];

  const item = { type: 'table', raw: rtrim(cap[0], '\n'), header: [], align: [], rows: [] };

  if (headers.length !== aligns.length) {
    return undefined;
  }

  for (const align of aligns) {
    if (other.tableAlignRight.test(align)) {
      item.align.push('right');
    } else if (other.tableAlignCenter.test(align)) {
      item.align.push('center');
    } else if (other.tableAlignLeft.test(align)) {
      item.align.push('left');
    } else {
      item.align.push(null);
    }
  }

  for (let i = 0; i < headers.length; i++) {
    item.header.push({
      text: headers[i],
      tokens: lexInlineQueue(headers[i]),
      header: true,
      align: item.align[i],
    });
  }

  for (const row of rows) {
    item.rows.push(splitCells(row, item.header.length).map((cell, i) => ({
      text: cell,
      tokens: lexInlineQueue(cell),
      header: false,
      align: item.align[i],
    })));
  }

  return item;
}

function tokLheading(src) {
  // cheap reject: no line in src starts (within 3 spaces) with '=' or '-'
  {
    let nl = src.indexOf('\n');
    let possible = false;
    while (nl !== -1) {
      let k = nl + 1;
      let sp = 0;
      while (k < src.length && src.charCodeAt(k) === 32 && sp < 3) { k++; sp++; }
      const c = src.charCodeAt(k);
      if (c === 61 || c === 45) { possible = true; break; }
      nl = src.indexOf('\n', nl + 1);
    }
    if (!possible) return undefined;
  }
  // cheap pre-scan: some line must start (after <=3 spaces) with '=' or '-'
  let nl = src.indexOf('\n');
  let found = false;
  while (nl !== -1 && nl + 1 < src.length) {
    let k = nl + 1;
    let sp = 0;
    while (sp < 4 && k < src.length && src.charCodeAt(k) === 32) { k++; sp++; }
    if (sp < 4 && k < src.length) {
      const c = src.charCodeAt(k);
      if (c === 61 || c === 45) { found = true; break; }
    }
    nl = src.indexOf('\n', nl + 1);
  }
  if (!found) return undefined;
  const cap = lheadingGfm.exec(src);
  if (cap) {
    const text = cap[1].trim();
    return {
      type: 'heading',
      raw: rtrim(cap[0], '\n'),
      depth: cap[2].charAt(0) === '=' ? 1 : 2,
      text,
      tokens: lexInlineQueue(text),
    };
  }
}

function tokParagraph(src) {
  const cap = paragraphGfm.exec(src);
  if (cap) {
    const text = cap[1].charAt(cap[1].length - 1) === '\n' ? cap[1].slice(0, -1) : cap[1];
    return { type: 'paragraph', raw: cap[0], text, tokens: lexInlineQueue(text) };
  }
}

function tokText(src) {
  const cap = blockText.exec(src);
  if (cap) {
    return { type: 'text', raw: cap[0], text: cap[0], tokens: lexInlineQueue(cap[0]) };
  }
}

// ---------------------------------------------------------------------------
// Tokenizers (inline)
// ---------------------------------------------------------------------------

function tokEscape(src) {
  const cap = escape.exec(src);
  if (cap) {
    return { type: 'escape', raw: cap[0], text: cap[1] };
  }
}

function tokTag(src) {
  if (src.charCodeAt(0) !== 60) return undefined; // '<'
  const cap = tag.exec(src);
  if (cap) {
    if (!lexerState.inLink && other.startATag.test(cap[0])) {
      lexerState.inLink = true;
    } else if (lexerState.inLink && other.endATag.test(cap[0])) {
      lexerState.inLink = false;
    }
    if (!lexerState.inRawBlock && other.startPreScriptTag.test(cap[0])) {
      lexerState.inRawBlock = true;
    } else if (lexerState.inRawBlock && other.endPreScriptTag.test(cap[0])) {
      lexerState.inRawBlock = false;
    }
    return {
      type: 'html',
      raw: cap[0],
      inLink: lexerState.inLink,
      inRawBlock: lexerState.inRawBlock,
      block: false,
      text: cap[0],
    };
  }
}

function tokLink(src) {
  const c0 = src.charCodeAt(0);
  if (c0 !== 91 && !(c0 === 33 && src.charCodeAt(1) === 91)) return undefined; // '[' or '!['
  if (lexerState.linkParenPossible === false) {
    return undefined;
  }
  const cap = link.exec(src);
  if (cap) {
    const labelStart = cap[0].charAt(0) === '!' ? 2 : 1;
    if (isLabelEndInsideToken(src, cap[1], labelStart)) {
      return undefined;
    }

    const trimmedUrl = cap[2].trim();
    if (other.startAngleBracket.test(trimmedUrl)) {
      if (!other.endAngleBracket.test(trimmedUrl)) {
        return undefined;
      }
      const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), '\\');
      if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
        return undefined;
      }
    } else {
      const lastParenIndex = findClosingBracket(cap[2], '()');
      if (lastParenIndex === -2) {
        return undefined;
      }
      if (lastParenIndex > -1) {
        const start = cap[0].indexOf('!') === 0 ? 5 : 4;
        const linkLen = start + cap[1].length + lastParenIndex;
        cap[2] = cap[2].substring(0, lastParenIndex);
        cap[0] = cap[0].substring(0, linkLen).trim();
        cap[3] = '';
      }
    }
    const unescaped = rtrim(cap[0].slice(0, -1), '\\');
    if ((cap[0].length - unescaped.length) % 2 === 0) {
      return undefined;
    }
    let href = cap[2];
    let title = '';
    title = cap[3] ? cap[3].slice(1, -1) : '';

    href = href.trim();
    if (other.startAngleBracket.test(href)) {
      href = href.slice(1, -1);
    }
    return outputLink(cap, {
      href: href ? href.replace(anyPunctuation, '$1') : href,
      title: title ? title.replace(anyPunctuation, '$1') : title,
    }, cap[0]);
  }
}

function tokReflink(src) {
  if (src.indexOf(']') === -1) return undefined;
  let cap;
  if ((cap = reflink.exec(src)) || (cap = nolink.exec(src))) {
    const labelStart = cap[0].charAt(0) === '!' ? 2 : 1;
    if (isLabelEndInsideToken(src, cap[1], labelStart)) {
      return undefined;
    }

    const linkDef = tokensLinks[normalizeLabel(cap[2] || cap[1])];
    if (!linkDef) {
      const text = cap[0].charAt(0);
      return { type: 'text', raw: text, text };
    }
    return outputLink(cap, linkDef, cap[0]);
  }
}

function tokEmStrong(src, maskedSrc, prevChar = '') {
  const c0 = src.charCodeAt(0);
  if (c0 !== 42 && c0 !== 95) return undefined; // '*' '_'
  let match = emStrongLDelim.exec(src);
  if (!match) return undefined;
  if (!match[1] && !match[2] && !match[3] && !match[4]) return undefined;

  const delimChar = match[0][0];
  const midRun = prevChar === delimChar;

  const srcStart = maskedSrc.length - src.length;
  let runStart = srcStart;
  while (runStart > 0 && maskedSrc[runStart - 1] === delimChar) {
    runStart--;
  }
  const runPrevChar = [...maskedSrc.slice(Math.max(0, runStart - 2), runStart)].at(-1) ?? '';
  const runPrevPunct = runPrevChar === '*' || runPrevChar === '_' || !!punctuation.exec(runPrevChar);
  if (runStart < srcStart) {
    prevChar = runPrevChar;
  }
  const prevPunct = runStart < srcStart ? runPrevPunct : !!punctuation.exec(prevChar);

  if (match[4] && prevChar.match(other.unicodeAlphaNumeric)) return undefined;

  const nextChar = match[1] || match[3] || '';

  if (!nextChar || !prevChar || prevPunct) {
    const lLength = [...match[0]].length - 1;
    let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;

    const runLength = srcStart - runStart + lLength;
    const openerCanClose = !!runPrevChar.trim()
      && (!!nextChar || (delimChar === '*' && !runPrevPunct));
    if (delimChar !== '*' && delimChar !== '_') return undefined;
    const endReg = delimChar === '*' ? emStrongRDelimAst : emStrongRDelimUnd;
    const lastPossibleEmStrongCloserIndex = cachedLastPossibleEmStrongCloserIndex(tokenizerObj, maskedSrc, delimChar);
    const emStrongCloserWindowStart = maskedSrc.length - src.length + lLength;
    if (lastPossibleEmStrongCloserIndex < emStrongCloserWindowStart) return undefined;
    maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
    const lastPossibleEmStrongCloserIndexInWindow = lastPossibleEmStrongCloserIndex - emStrongCloserWindowStart;
    endReg.lastIndex = 0;

    while ((match = endReg.exec(maskedSrc)) !== null) {
      if (match.index > lastPossibleEmStrongCloserIndexInWindow) break;
      rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

      if (!rDelim) continue;

      rLength = [...rDelim].length;

      if (match[3] || match[4]) {
        delimTotal += rLength;
        continue;
      } else if (match[5] || match[6] || openerCanClose) {
        if (midRun && (match[5] || match[6])) {
          break;
        }
        if (runLength % 3 && !((runLength + rLength) % 3)) {
          midDelimTotal += rLength;
          continue;
        }
      }

      delimTotal -= rLength;

      if (delimTotal > 0) continue;

      rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
      const lastCharLength = [...match[0]][0].length;
      const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);

      if (Math.min(lLength, rLength) % 2) {
        const text = raw.slice(1, -1);
        return { type: 'em', raw, text, tokens: inlineTokens(text) };
      }

      const text = raw.slice(2, -2);
      return { type: 'strong', raw, text, tokens: inlineTokens(text) };
    }
  }
  return undefined;
}

function tokCodespan(src) {
  if (src.charCodeAt(0) !== 96) return undefined; // '`'
  const cap = inlineCode.exec(src);
  if (cap) {
    let text = cap[2].replace(other.newLineCharGlobal, ' ');
    const hasNonSpaceChars = other.nonSpaceChar.test(text);
    const hasSpaceCharsOnBothEnds = other.startingSpaceChar.test(text) && other.endingSpaceChar.test(text);
    if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
      text = text.substring(1, text.length - 1);
    }
    return { type: 'codespan', raw: cap[0], text };
  }
}

function tokBr(src) {
  const c0 = src.charCodeAt(0);
  if (c0 !== 32 && c0 !== 92) return undefined; // ' ' '\\'
  if (c0 === 32 && src.charCodeAt(1) !== 32) return undefined;
  const cap = br.exec(src);
  if (cap) {
    return { type: 'br', raw: cap[0] };
  }
}

function tokDel(src, maskedSrc, prevChar = '') {
  if (src.charCodeAt(0) !== 126) return undefined; // '~'
  let match = delLDelim.exec(src);
  if (!match) return undefined;

  const nextChar = match[1] || '';

  if (!nextChar || !prevChar || punctuation.exec(prevChar)) {
    const lLength = [...match[0]].length - 1;
    let rDelim, rLength, delimTotal = lLength;

    const endReg = delRDelim;
    const lastPossibleDelCloserIndex = cachedLastPossibleDelCloserIndex(tokenizerObj, maskedSrc);
    const delCloserWindowStart = maskedSrc.length - src.length + lLength;
    if (lastPossibleDelCloserIndex < delCloserWindowStart) return undefined;
    maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
    const lastPossibleDelCloserIndexInWindow = lastPossibleDelCloserIndex - delCloserWindowStart;
    endReg.lastIndex = 0;

    while ((match = endReg.exec(maskedSrc)) !== null) {
      if (match.index > lastPossibleDelCloserIndexInWindow) break;
      rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

      if (!rDelim) continue;

      rLength = [...rDelim].length;

      if (rLength !== lLength) continue;

      if (match[3] || match[4]) {
        delimTotal += rLength;
        continue;
      }

      delimTotal -= rLength;

      if (delimTotal > 0) continue;

      rLength = Math.min(rLength, rLength + delimTotal);
      const lastCharLength = [...match[0]][0].length;
      const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);

      const text = raw.slice(lLength, -lLength);
      return { type: 'del', raw, text, tokens: inlineTokens(text) };
    }
  }
  return undefined;
}

function tokAutolink(src) {
  if (src.charCodeAt(0) !== 60) return undefined; // '<'
  const cap = autolink.exec(src);
  if (cap) {
    let text, href;
    if (cap[2] === '@') {
      text = cap[1];
      href = 'mailto:' + text;
    } else {
      text = cap[1];
      href = text;
    }
    return {
      type: 'link',
      raw: cap[0],
      text,
      href,
      autolink: true,
      tokens: [{ type: 'text', raw: text, text }],
    };
  }
}

function tokUrl(src) {
  let cap;
  if ((cap = url.exec(src))) {
    let text, href;
    if (cap[2] === '@') {
      text = cap[0];
      href = 'mailto:' + text;
    } else {
      let prevCapZero;
      do {
        prevCapZero = cap[0];
        cap[0] = backpedal.exec(cap[0])?.[0] ?? '';
      } while (prevCapZero !== cap[0]);
      text = cap[0];
      if (cap[1] === 'www.') {
        href = 'http://' + cap[0];
      } else {
        href = cap[0];
      }
    }
    return {
      type: 'link',
      raw: cap[0],
      text,
      href,
      autolink: true,
      tokens: [{ type: 'text', raw: text, text }],
    };
  }
}

/**
 * Plain-text fast path. Prose runs hold none of the characters the inline
 * text rule stops at, so they can be consumed whole instead of running the
 * full inline-text regex. The stop set here is a superset of the regex's own
 * stop conditions, and every early stop is one the regex makes too, so the
 * token stream is unchanged; adjacent text tokens render identically merged.
 */
const EMAIL_SET_CHAR = /[a-zA-Z0-9.!#$%&'*+/=?{}~-]/;
const PROTOCOL_BACK = /(?:https?|ftp)$/i;

const PLAIN_STOP_CODES = new Int32Array(128);
for (const ch of '\\<![`*~_@: ') PLAIN_STOP_CODES[ch.charCodeAt(0)] = 1;

function plainRunEnd(src, start) {
  const n = src.length;
  let i = start;
  let wIdx = src.indexOf('www.', start);
  while (i < n) {
    const cc = src.charCodeAt(i);
    if (cc >= 128 || PLAIN_STOP_CODES[cc] === 0) { i++; continue; }
    // stop char reached: a pending www. autolink start cuts the run first
    if (wIdx !== -1 && wIdx <= i) {
      const okStart = wIdx === 0 || /[\s*_~(]/.test(src.charAt(wIdx - 1));
      if (okStart) {
        if (wIdx <= start) return Math.min(wIdx + 4, n);
        return wIdx;
      }
      wIdx = src.indexOf('www.', wIdx + 1);
    }
    const c = String.fromCharCode(cc);
    if (cc === 92 || cc === 60 || cc === 33 || cc === 91 || cc === 96 || cc === 42 || cc === 126 || cc === 95) {
      return i;
    }
    if (cc === 32) { // ' '
      let j = i + 1;
      while (j < n && src.charCodeAt(j) === 32) j++;
      if (j < n && src.charCodeAt(j) === 10 && j - i >= 2) return i;
      i = j;
      continue;
    }
    if (cc === 64) { // '@'
      let j = i;
      while (j > start && EMAIL_SET_CHAR.test(src.charAt(j - 1))) j--;
      if (j < i) {
        if (j === start) return 0;
        return j;
      }
      i++;
      continue;
    }
    if (cc === 58) { // ':'
      if (src.charCodeAt(i + 1) === 47 && src.charCodeAt(i + 2) === 47) {
        const back = src.slice(Math.max(start, i - 6), i);
        const pm = PROTOCOL_BACK.exec(back);
        if (pm && pm.index === back.length - pm[0].length) {
          const pos = i - pm[0].length;
          if (pos <= start) return 0;
          return pos;
        }
      } else if (src.startsWith('mailto:', i) || src.startsWith('xmpp:', i)) {
        if (i === 0 || /[^a-zA-Z0-9]/.test(src.charAt(i - 1))) {
          const em = _extendedEmailProtocol.exec(src.slice(i));
          if (em && em.index === 0) {
            if (i <= start) return 0;
            return i;
          }
        }
      }
      i++;
      continue;
    }
    i++;
  }
  if (wIdx !== -1 && wIdx > start) {
    const okStart = wIdx === 0 || /[\s*_~(]/.test(src.charAt(wIdx - 1));
    if (okStart) return wIdx;
  }
  return n;
}

function tokInlineText(src) {
  const fastEnd = plainRunEnd(src, 0);
  if (fastEnd > 0) {
    const raw = src.slice(0, fastEnd);
    const escaped = lexerState.inRawBlock;
    return {
      type: 'text',
      raw,
      text: escaped ? raw : decodeNumericCharacterReferences(raw),
      escaped,
    };
  }
  const cap = textGfm.exec(src);
  if (cap) {
    const escaped = lexerState.inRawBlock;
    return {
      type: 'text',
      raw: cap[0],
      text: escaped ? cap[0] : decodeNumericCharacterReferences(cap[0]),
      escaped,
    };
  }
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

function blockTokens(src, tokens, lastParagraphClipped = false) {
  let srcLength = Infinity;
  while (src) {
    if (src.length < srcLength) {
      srcLength = src.length;
    } else {
      infiniteLoopError(src.charCodeAt(0));
      break;
    }

    let token;

    {
      // space fast path: runs of spaces/tabs ending in \n (or EOF)
      let k = 0;
      const nn = src.length;
      while (k < nn) {
        const cc = src.charCodeAt(k);
        if (cc === 32 || cc === 9) { k++; continue; }
        break;
      }
      if (k < nn && src.charCodeAt(k) === 10) {
        let end = k + 1;
        let lastNl = k;
        while (end < nn) {
          const cc = src.charCodeAt(end);
          if (cc === 32 || cc === 9 || cc === 10) {
            if (cc === 10) lastNl = end;
            end++;
            continue;
          }
          break;
        }
        // the regex's group needs a \n after any trailing [ \t]*: back off the
        // spaces of the final partial group so an indented code block can start
        while (end > lastNl + 1 && (src.charCodeAt(end - 1) === 32 || src.charCodeAt(end - 1) === 9)) end--;
        token = { type: 'space', raw: src.slice(0, end) };
        src = src.substring(end);
        const lastToken = tokens[tokens.length - 1];
        if (end === 1 && lastToken !== undefined) {
          lastToken.raw += '\n';
        } else {
          tokens.push(token);
        }
        continue;
      }
    }
    if ((token = tokSpace(src))) {
      src = src.substring(token.raw.length);
      const lastToken = tokens[tokens.length - 1];
      if (token.raw.length === 1 && lastToken !== undefined) {
        lastToken.raw += '\n';
      } else {
        tokens.push(token);
      }
      continue;
    }

    if ((token = tokCode(src))) {
      src = src.substring(token.raw.length);
      const lastToken = tokens[tokens.length - 1];
      if (lastToken?.type === 'paragraph' || lastToken?.type === 'text') {
        lastToken.raw += (lastToken.raw.endsWith('\n') ? '' : '\n') + token.raw;
        lastToken.text += '\n' + token.text;
        inlineQueue[inlineQueue.length - 1].src = lastToken.text;
      } else {
        tokens.push(token);
      }
      continue;
    }

    if ((token = tokFences(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokHeading(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokHr(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokBlockquote(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokList(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokHtml(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokDef(src))) {
      src = src.substring(token.raw.length);
      const lastToken = tokens[tokens.length - 1];
      if (lastToken?.type === 'paragraph' || lastToken?.type === 'text') {
        lastToken.raw += (lastToken.raw.endsWith('\n') ? '' : '\n') + token.raw;
        lastToken.text += '\n' + token.raw;
        inlineQueue[inlineQueue.length - 1].src = lastToken.text;
      } else {
        if (!tokensLinks[token.tag]) {
          tokensLinks[token.tag] = {
            href: token.href,
            title: token.title,
          };
        }
        tokens.push(token);
      }
      continue;
    }

    if ((token = tokTable(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((token = tokLheading(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if (lexerState.top && (token = tokParagraph(src))) {
      const lastToken = tokens[tokens.length - 1];
      if (lastParagraphClipped && lastToken?.type === 'paragraph') {
        lastToken.raw += (lastToken.raw.endsWith('\n') ? '' : '\n') + token.raw;
        lastToken.text += '\n' + token.text;
        inlineQueue.pop();
        inlineQueue[inlineQueue.length - 1].src = lastToken.text;
      } else {
        tokens.push(token);
      }
      lastParagraphClipped = token.raw.length !== src.length;
      src = src.substring(token.raw.length);
      continue;
    }

    if ((token = tokText(src))) {
      src = src.substring(token.raw.length);
      const lastToken = tokens[tokens.length - 1];
      if (lastToken?.type === 'text') {
        lastToken.raw += (lastToken.raw.endsWith('\n') ? '' : '\n') + token.raw;
        lastToken.text += '\n' + token.text;
        inlineQueue.pop();
        inlineQueue[inlineQueue.length - 1].src = lastToken.text;
      } else {
        tokens.push(token);
      }
      continue;
    }

    if (src) {
      infiniteLoopError(src.charCodeAt(0));
      break;
    }
  }

  lexerState.top = true;
  return tokens;
}

function lexInlineQueue(src) {
  const tokens = [];
  inlineQueue.push({ src, tokens });
  return tokens;
}

function tokensLinksHasDefs() {
  for (const k in tokensLinks) return true;
  return false;
}

function maskSrc(src) {
  let maskedSrc = src;

  if (src.includes('[') && tokensLinksHasDefs()) {
    const maskReflink = (match0) => {
      const refStart = match0.lastIndexOf('[');
      if (!Object.hasOwn(tokensLinks, normalizeLabel(match0.slice(refStart + 1, -1)))) {
        return match0;
      }
      if (refStart > 1 && match0.charAt(0) !== '!') {
        const text = match0.slice(1, refStart - 1);
        if (linkInText(text)) {
          return '[' + text.replace(reflinkSearch, maskReflink)
            + '][' + 'a'.repeat(match0.length - refStart - 2) + ']';
        }
      }
      return '[' + 'a'.repeat(match0.length - 2) + ']';
    };
    maskedSrc = maskedSrc.replace(reflinkSearch, maskReflink);
  }

  if (src.indexOf('\\') !== -1 || src.indexOf('`') !== -1)
  maskedSrc = maskedSrc.replace(anyPunctuationOutsideCode, (match0, code, punct) => {
    if (punct) {
      return '+'.repeat(match0.length);
    }
    if (code) {
      return code + match0.slice(code.length, -code.length).replace(/`/g, '+') + code;
    }
    return match0;
  });

  if (src.indexOf('[') !== -1 || src.indexOf('`') !== -1 || src.indexOf('<') !== -1)
  maskedSrc = maskedSrc.replace(blockSkip, (match0, _link, context) => {
    const offset = context ? context.length : 0;
    return match0.slice(0, offset) + '[' + 'a'.repeat(match0.length - offset - 2) + ']';
  });

  return maskedSrc;
}

function inlineTokens(src, tokens = []) {
  const prevLinkParenPossible = lexerState.linkParenPossible;
  lexerState.linkParenPossible = prevLinkParenPossible && src.includes(')');
  try {
    return inlineTokensInner(src, tokens);
  } finally {
    lexerState.linkParenPossible = prevLinkParenPossible;
  }
}

function inlineTokensInner(src, tokens) {
  const needsMask = src.includes('*') || src.includes('_') || src.includes('~');
  if (!needsMask) {
    // no emphasis/delimiter characters: masking and closer scans only affect em/del
    return tokenizeInlines(src, src, tokens);
  }
  const maskedSrc = maskSrc(src);

  beginEmStrongDelCloserScan(tokenizerObj, maskedSrc);
  try {
    return tokenizeInlines(src, maskedSrc, tokens);
  } finally {
    endEmStrongDelCloserScan(tokenizerObj);
  }
}

// Dispatch bitmask per first char: which tokenizers can possibly match. Order of
// the checks in tokenizeInlines stays identical to marked; the mask only skips
// handlers that cannot match the character at the cursor.
const ESC=1, TAG=2, LINK=4, REFLINK=8, EMSTRONG=16, CODESPAN=32, BR=64, DEL=128, AUTOLINK=256, URL=512, TEXT=1024;
const DISPATCH = new Int32Array(128);
// characters that may start marked's `email` alternative (email local-part set)
const EMAIL_START = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+/=?^_`{|}~-";
for (let c = 0; c < 128; c++) DISPATCH[c] = TEXT;
for (let i = 0; i < EMAIL_START.length; i++) DISPATCH[EMAIL_START.charCodeAt(i)] |= URL;
DISPATCH[92] |= ESC | BR;                // backslash (or a '\\\n' hard break)
DISPATCH[60] |= TAG | LINK | AUTOLINK;   // <
DISPATCH[91] |= LINK | REFLINK;          // [
DISPATCH[33] |= LINK | REFLINK;          // ! (image link or image ref)
DISPATCH[42] |= EMSTRONG;                // *
DISPATCH[95] |= EMSTRONG;                // _
DISPATCH[96] |= CODESPAN;                // `
DISPATCH[126] |= DEL;                    // ~
DISPATCH[10] |= BR;                      // \n
DISPATCH[32] |= BR;                      // '  \n' two-space hard break

function tokenizeInlines(src, maskedSrc, tokens) {
  let keepPrevChar = false;
  let prevChar = '';
  let srcLength = Infinity;
  while (src) {
    if (src.length < srcLength) {
      srcLength = src.length;
    } else {
      infiniteLoopError(src.charCodeAt(0));
      break;
    }

    if (!keepPrevChar) {
      prevChar = '';
    }
    keepPrevChar = false;

    let token;
    const cc = src.charCodeAt(0);
    const mask = cc < 128 ? DISPATCH[cc] : TEXT;

    if ((mask & ESC) && (token = tokEscape(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & TAG) && (token = tokTag(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & LINK) && (token = tokLink(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & REFLINK) && (token = tokReflink(src))) {
      src = src.substring(token.raw.length);
      const lastToken = tokens[tokens.length - 1];
      if (token.type === 'text' && lastToken?.type === 'text') {
        lastToken.raw += token.raw;
        lastToken.text += token.text;
      } else {
        tokens.push(token);
      }
      continue;
    }

    if ((mask & EMSTRONG) && (token = tokEmStrong(src, maskedSrc, prevChar))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & CODESPAN) && (token = tokCodespan(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & BR) && (token = tokBr(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & DEL) && (token = tokDel(src, maskedSrc, prevChar))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & AUTOLINK) && (token = tokAutolink(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & URL) && !lexerState.inLink && (token = tokUrl(src))) {
      src = src.substring(token.raw.length);
      tokens.push(token);
      continue;
    }

    if ((mask & TEXT) && (token = tokInlineText(src))) {
      src = src.substring(token.raw.length);
      if (token.raw.slice(-1) !== '_') {
        prevChar = token.raw.slice(-1);
      }
      keepPrevChar = true;
      const lastToken = tokens[tokens.length - 1];
      if (lastToken?.type === 'text') {
        lastToken.raw += token.raw;
        lastToken.text += token.text;
      } else {
        tokens.push(token);
      }
      continue;
    }

    if (src) {
      infiniteLoopError(src.charCodeAt(0));
      break;
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Renderer + Parser (string output, no options)
// ---------------------------------------------------------------------------

function parseInlineTokens(tokens, textRenderer = false) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token.type) {
      case 'escape':
        out += escapeHtmlEntities(token.text);
        break;
      case 'html':
        out += token.text;
        break;
      case 'link': {
        const parsedText = token.autolink
          ? escapeHtmlEntities(token.text, true)
          : parseInlineTokens(token.tokens, textRenderer);
        const cleanHref = cleanUrl(token.href);
        if (cleanHref === null) {
          out += parsedText;
          break;
        }
        const href = escapeHtmlEntities(cleanHref, token.autolink);
        let s = '<a href="' + href + '"';
        if (token.title) {
          s += ' title="' + escapeHtmlEntities(token.title) + '"';
        }
        s += '>' + parsedText + '</a>';
        out += s;
        break;
      }
      case 'image': {
        let text = token.text;
        if (token.tokens) {
          text = parseTextTokens(token.tokens);
        }
        const cleanHref = cleanUrl(token.href);
        if (cleanHref === null) {
          out += escapeHtmlEntities(text);
          break;
        }
        let s = `<img src="${escapeHtmlEntities(cleanHref)}" alt="${escapeHtmlEntities(text)}"`;
        if (token.title) {
          s += ` title="${escapeHtmlEntities(token.title)}"`;
        }
        s += '>';
        out += s;
        break;
      }
      case 'checkbox':
        out += '<input '
          + (token.checked ? 'checked="" ' : '')
          + 'disabled="" type="checkbox"> ';
        break;
      case 'strong':
        out += textRenderer
          ? (token.tokens ? parseInlineTokens(token.tokens, true) : token.text)
          : `<strong>${parseInlineTokens(token.tokens)}</strong>`;
        break;
      case 'em':
        out += textRenderer
          ? (token.tokens ? parseInlineTokens(token.tokens, true) : token.text)
          : `<em>${parseInlineTokens(token.tokens)}</em>`;
        break;
      case 'codespan':
        out += textRenderer ? token.text : `<code>${escapeHtmlEntities(token.text, true)}</code>`;
        break;
      case 'br':
        out += textRenderer ? '' : '<br>';
        break;
      case 'del':
        out += textRenderer
          ? (token.tokens ? parseInlineTokens(token.tokens, true) : token.text)
          : `<del>${parseInlineTokens(token.tokens)}</del>`;
        break;
      case 'text':
        out += 'tokens' in token && token.tokens
          ? parseInlineTokens(token.tokens)
          : ('escaped' in token && token.escaped ? token.text : escapeHtmlEntities(token.text));
        break;
      default:
        throw new Error('Token with "' + token.type + '" type was not found.');
    }
  }
  return out;
}

function renderTokens(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token.type) {
      case 'space':
        break;
      case 'hr':
        out += '<hr>\n';
        break;
      case 'heading':
        out += `<h${token.depth}>${parseInlineTokens(token.tokens)}</h${token.depth}>\n`;
        break;
      case 'code': {
        const langString = (token.lang || '').match(other.notSpaceStart)?.[0];
        const code = token.text ? token.text.replace(other.endingNewline, '') + '\n' : '';
        if (!langString) {
          out += '<pre><code>' + escapeHtmlEntities(code, true) + '</code></pre>\n';
        } else {
          out += '<pre><code class="language-'
            + escapeHtmlEntities(langString)
            + '">'
            + escapeHtmlEntities(code, true)
            + '</code></pre>\n';
        }
        break;
      }
      case 'table': {
        let header = '';
        let cell = '';
        for (let j = 0; j < token.header.length; j++) {
          cell += renderCell(token.header[j]);
        }
        header += `<tr>\n${cell}</tr>\n`;

        let body = '';
        for (let j = 0; j < token.rows.length; j++) {
          const row = token.rows[j];
          cell = '';
          for (let k = 0; k < row.length; k++) {
            cell += renderCell(row[k]);
          }
          body += `<tr>\n${cell}</tr>\n`;
        }
        if (body) body = `<tbody>${body}</tbody>`;

        out += '<table>\n<thead>\n' + header + '</thead>\n' + body + '</table>\n';
        break;
      }
      case 'blockquote':
        out += `<blockquote>\n${renderTokens(token.tokens)}</blockquote>\n`;
        break;
      case 'list': {
        let body = '';
        for (let j = 0; j < token.items.length; j++) {
          const item = token.items[j];
          body += `<li>${renderTokens(item.tokens)}</li>\n`;
        }
        const type = token.ordered ? 'ol' : 'ul';
        const startAttr = (token.ordered && token.start !== 1) ? (' start="' + token.start + '"') : '';
        out += '<' + type + startAttr + '>\n' + body + '</' + type + '>\n';
        break;
      }
      case 'checkbox':
        out += '<input '
          + (token.checked ? 'checked="" ' : '')
          + 'disabled="" type="checkbox"> ';
        break;
      case 'html':
        out += token.text;
        break;
      case 'def':
        break;
      case 'paragraph':
        out += `<p>${parseInlineTokens(token.tokens)}</p>\n`;
        break;
      case 'text':
        out += 'tokens' in token && token.tokens
          ? parseInlineTokens(token.tokens)
          : ('escaped' in token && token.escaped ? token.text : escapeHtmlEntities(token.text));
        break;
      default:
        throw new Error('Token with "' + token.type + '" type was not found.');
    }
  }
  return out;
}

/** TextRenderer only: flatten inline tokens to their textual part. */
function parseTextTokens(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token.type) {
      case 'escape':
        out += token.text;
        break;
      case 'html':
        out += token.text;
        break;
      case 'link':
        out += token.tokens ? parseTextTokens(token.tokens) : token.text;
        break;
      case 'image':
        out += token.tokens ? parseTextTokens(token.tokens) : token.text;
        break;
      case 'strong':
      case 'em':
      case 'del':
        out += token.tokens ? parseTextTokens(token.tokens) : token.text;
        break;
      case 'codespan':
        out += token.text;
        break;
      case 'br':
        break;
      case 'checkbox':
        out += token.raw;
        break;
      case 'text':
        out += 'tokens' in token && token.tokens ? parseTextTokens(token.tokens) : token.text;
        break;
      default:
        throw new Error('Token with "' + token.type + '" type was not found.');
    }
  }
  return out;
}

function renderCell(token) {  const content = parseInlineTokens(token.tokens);
  const type = token.header ? 'th' : 'td';
  const tagStr = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
  return tagStr + content + `</${type}>\n`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parse(markdown) {
  if (markdown === undefined || markdown === null) {
    throw new Error('marked(): input parameter is undefined or null');
  }
  if (typeof markdown !== 'string') {
    throw new Error('marked(): input parameter is of type ' + Object.prototype.toString.call(markdown) + ', string expected');
  }
  const src = markdown.indexOf('\r') === -1
    ? markdown
    : markdown.replace(other.carriageReturn, '\n');

  tokensLinks = Object.create(null);
  inlineQueue = [];
  lexerState.inLink = false;
  lexerState.inRawBlock = false;
  lexerState.linkEmitted = false;
  lexerState.linkParenPossible = true;
  lexerState.top = true;

  const tokens = [];
  blockTokens(src, tokens);

  for (let i = 0; i < inlineQueue.length; i++) {
    const next = inlineQueue[i];
    lexerState.inRawBlock = false;
    inlineTokens(next.src, next.tokens);
  }
  inlineQueue = [];

  const htmlOut = renderTokens(tokens);

  // reset for the next parse
  tokensLinks = Object.create(null);

  return htmlOut;
}

export default { parse };
