import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import categoryEndpoint from 'src/api/categoryEndpoint';
import { finishWaiting, setCategoryList, startWaiting } from 'src/redux/uiSlice';
import randomcolor from 'randomcolor';
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
    <div className="flex flex-col gap-4">
      <p>歡迎來到 PMP - Practice Makes Perfect。</p>
      <p>
        這是一個幫助你練習各種題目的平台，提供免費的線上題庫，可以線上答題，題目清單顯示各題的答對率，讓你彈性選擇題目。答題後可以在答題記錄檢視自己的答題狀況。
      </p>
      <p>
        每一道題目都可以在{' '}
        <a
          className="text-blue-500 underline"
          target="_blank"
          href="https://www.facebook.com/profile.php?id=61560070388701"
        >
          FB粉絲專頁
        </a>{' '}
        找到討論串，歡迎各位老師同學們不吝在討論串中分享解題思路與相關知識，讓大家一起成長！
      </p>
      <p>
        如果你喜歡這個平台，請多邀請你的戰友們加入使用！我們會定期檢視各類別的使用狀況，若答題足夠踴躍，我們會更頻繁地新增題目到該類別。
      </p>
      <p>
        如果有希望的新題目類別、題目類型、題目來源，或是希望有新的功能，請到{' '}
        <a
          className="text-blue-500 underline"
          target="_blank"
          href="https://www.facebook.com/profile.php?id=61560070388701"
        >
          FB粉絲專頁
        </a>{' '}
        私訊我們。如果你是老師，想要有私人類別整理自己的題庫，也請找我們諮詢！
      </p>
      <p>祝您練習愉快！請在下方選擇類別：</p>
      <div className="flex flex-wrap items-center justify-center gap-5">
        {categoryList?.map((v) => (
          <div
            key={v.id}
            className="cursor-pointer rounded px-2 py-1"
            style={{
              background: randomcolor({ luminosity: 'light', seed: v.id }),
            }}
            onClick={() => {
              navigate(`/list?categoryId=${v.id}`);
            }}
          >
            {v.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
