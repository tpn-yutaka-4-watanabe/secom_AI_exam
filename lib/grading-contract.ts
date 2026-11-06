// The model classifies deductions; the application alone assigns and adds points.
export const MAIL_DEDUCTION_POINTS: Readonly<Record<string, number>> = { D1: 3, D2: 2, D3: 2, D4: 1 };

export const ITEMS_ONLY_RULE = "点数として出力するのはcriteria各項目のscoreだけ。項目点の小計・合計・総得点・減点合計・差引得点を計算も出力もしない。トップレベルのscore、base_score、total_score、deduction_total等を作らない。deductionsの各要素にpointsや件数を付けない。減点は該当事由1件につきid・原文根拠・理由・ng_hit_idsを1要素で返す。アプリがD1=3、D2=2、D3=2、D4=1を割り当て、項目点と減点を集計する。summary・comment・review_reasonsにも小計や合計を書かない。";

export const JSON_OUTPUT_RULE = "プロンプトの例にある波括弧はテンプレート変数との衝突を避けるため全角の｛｝で示している。出力時はJSON構造の波括弧だけを半角（U+007BとU+007D）に変換し、有効なJSONオブジェクト1個だけを返す。回答本文から引用する文字列の文字・記号は変換しない。他の記号は例のままとし、Markdownや前置きは出力しない。";

export const VIDEO_LANGUAGE_RULE = "漢字の誤変換・誤字・当て字・ひらがな表記・表記揺れは、文脈から意図するシーンと指導内容が読み取れる限り正しい表記と同じ内容として採点する。漢字間違いや文章表現の拙さだけを理由に減点・部分点化・needs_reviewにしない。シーン名や採点語句との文字列の完全一致を要求しない。引用根拠は誤字を直さず原文のまま示す。内容が逆になる、意味が特定できない、○×が逆、必要な安全上の指導が欠ける場合は内容に基づいて判断する。";
