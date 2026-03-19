import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import categoryEndpoint from 'src/api/categoryEndpoint';
import { finishWaiting, setCategoryList, startWaiting } from 'src/redux/uiSlice';
import type { RootState } from 'src/redux/store';

const Home = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { categoryList } = useSelector((rootState: RootState) => rootState.ui);

  useEffect(() => {
    if (categoryList !== null) return;

    dispatch(startWaiting());
    categoryEndpoint
      .getCategory()
      .then((res) => {
        dispatch(setCategoryList(res?.data ?? null));
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, []);

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="w-4/5 cursor-pointer rounded-sm border p-2 text-center"
        onClick={() => navigate('/subject')}
      >
        10 種科目
      </div>
      <div
        className="w-4/5 cursor-pointer rounded-sm border p-2 text-center"
        onClick={() => navigate('/exam')}
      >
        100 張試卷
      </div>
      <div
        className="w-4/5 cursor-pointer rounded-sm border p-2 text-center"
        onClick={() => navigate('/question')}
      >
        1000 個試題
      </div>
      <div className="w-4/5 cursor-pointer rounded-sm border p-2 text-center">10000 名使用者</div>
    </div>
  );
};

export default Home;
