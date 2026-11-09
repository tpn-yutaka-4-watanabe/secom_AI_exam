const heading = "■お客様からのご指摘・要請内容";

export function MailRequest({ text }: { text: string }) {
  return <div className="mail-body">{text.split(/(■お客様からのご指摘・要請内容)/).map((part, index) =>
    part === heading ? <strong className="mail-request-heading" key={index}>{part}</strong> :
      index > 0 && part ? <span className="mail-request-content" key={index}>{part}</span> : part
  )}</div>;
}
