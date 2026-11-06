const heading = "■お客様からのご指摘・要請内容";

export function MailRequest({ text }: { text: string }) {
  return <div className="mail-body">{text.split(/(■お客様からのご指摘・要請内容)/).map((part, index) =>
    part === heading ? <strong className="mail-request-heading" key={index}>{part}</strong> : part
  )}</div>;
}
