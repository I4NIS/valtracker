type Props = {
  title: string;
  text: string;
};

export function Soon({ title, text }: Props) {
  return (
    <div className="content">
      <div className="stack">
        <h1 className="title">{title}</h1>
        <p className="muted">{text}</p>
      </div>
      <div className="empty">Cette section arrive dans une prochaine version.</div>
    </div>
  );
}
