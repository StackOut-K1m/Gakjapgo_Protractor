interface Props {
  title: string;
}

function ComingSoonPage({ title }: Props) {
  return (
    <section className="coming-soon">
      <h1>{title}</h1>
      <p className="muted">준비 중인 페이지입니다. 조금만 기다려주세요!</p>
    </section>
  );
}

export default ComingSoonPage;
