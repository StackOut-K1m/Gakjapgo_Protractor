import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section>
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
      <Link to="/">홈으로 돌아가기</Link>
    </section>
  );
}

export default NotFoundPage;
