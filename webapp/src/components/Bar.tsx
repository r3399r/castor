import { useNavigate } from 'react-router-dom';

const Bar = () => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-5 bg-blue-300 px-5 py-3">
      <div className="font-bold text-blue-900">Practice Makes Perfect</div>
      <div className="cursor-pointer" onClick={() => navigate('/')}>
        題目清單
      </div>
      <div className="cursor-pointer" onClick={() => navigate('/user')}>
        答題記錄
      </div>
    </div>
  );
};

export default Bar;
