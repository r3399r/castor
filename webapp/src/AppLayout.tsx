import { v4 as uuidv4 } from 'uuid';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Bar from './components/Bar';
import { useEffect, useState } from 'react';
import userEndpoint from './api/userEndpoint';
import { useDispatch } from 'react-redux';
import { setCategoryId } from './redux/uiSlice';
import { encrypt } from './util/crypto';

const AppLayout = () => {
  const [ready, setReady] = useState<boolean>(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    userEndpoint.getUser().then((res) => {
      if (!res) return;
      if (res.data === null) {
        if (localStorage.getItem('deviceId') === null) localStorage.setItem('deviceId', uuidv4());
      } else {
        if (localStorage.getItem('userId') === null)
          localStorage.setItem('userId', encrypt(res.data.id.toString(), res.data.deviceId));
        if (localStorage.getItem('deviceId') === null)
          localStorage.setItem('deviceId', res.data.deviceId);
      }
      setReady(true);
    });

    const pathname = location.pathname;
    if (!pathname.startsWith('/q/')) {
      if (
        localStorage.getItem('categoryId') === null ||
        isNaN(Number(localStorage.getItem('categoryId')))
      )
        navigate('/category');
      else dispatch(setCategoryId(Number(localStorage.getItem('categoryId'))));
    }
  }, []);

  if (!ready) return <div>loading...</div>;

  return (
    <>
      <Bar />
      <div className="mx-4 mt-4 mb-20 sm:mx-10 md:mx-auto md:w-[945px]">
        <Outlet />
      </div>
    </>
  );
};

export default AppLayout;
