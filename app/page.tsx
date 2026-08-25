import Link from "next/link";
import { ExamShell } from "./components/ExamShell";

export default function StartPage() {
  return (
    <ExamShell compactHeader>
      <main className="start-layout exam-portal-layout">
        <section className="start-hero">
          <div className="eyebrow">GRADE 4 CERTIFICATION</div>
          <h1>グレード4<br />認定試験</h1>
          <p className="start-lead">
            動画確認試験とメール対応試験は、それぞれ独立した試験として実施します。試験官から案内された試験を選択してください。
          </p>
        </section>

        <section className="exam-entry-panel" aria-labelledby="exam-entry-heading">
          <div className="card-kicker">EXAMINATION PORTAL</div>
          <h2 id="exam-entry-heading">受験する試験を選択</h2>
          <p>二つの試験を連続して受験する必要はありません。それぞれの専用URLから個別に提出できます。</p>

          <div className="exam-entry-list">
            <article>
              <span className="outline-number">01</span>
              <div>
                <h3>動画確認試験</h3>
                <p>管理者の一斉再生に合わせ、映像内の不適切な箇所とあるべき対応を記入します。</p>
                <code>/video-test</code>
              </div>
              <Link href="/video-test" className="primary-button">動画試験を開く <span>→</span></Link>
            </article>

            <article>
              <span className="outline-number">02</span>
              <div>
                <h3>メール対応試験</h3>
                <p>顧客からの受信メールを読み、営業担当者として返信を作成します。</p>
                <code>/email-test</code>
              </div>
              <Link href="/email-test" className="primary-button">メール試験を開く <span>→</span></Link>
            </article>
          </div>
        </section>
      </main>
    </ExamShell>
  );
}
