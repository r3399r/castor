import { useNavigate } from 'react-router-dom';
import randomcolor from 'randomcolor';
import { useSelector } from 'react-redux';
import type { RootState } from 'src/redux/store';

const Bar = () => {
  const navigate = useNavigate();
  const { categoryId } = useSelector((rootState: RootState) => rootState.ui);

  return (
    <div
      className="flex items-center gap-5 px-5 py-3"
      style={{ background: categoryId ? randomcolor({ luminosity: 'light', seed: categoryId }) : '#00000000' }}
    >
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
