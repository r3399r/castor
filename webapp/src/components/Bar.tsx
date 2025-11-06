import { useNavigate } from 'react-router-dom';
import randomcolor from 'randomcolor';
import { useSelector } from 'react-redux';
import type { RootState } from 'src/redux/store';
import { useAuth } from 'src/hooks/useAuth';
import { Button } from '@mui/material';

const Bar = () => {
  const navigate = useNavigate();
  const { categoryId } = useSelector((rootState: RootState) => rootState.ui);
  const { isAuthenticated, login, logout } = useAuth();

  return (
    <div
      className="flex items-center gap-5 px-5 py-3"
      style={{
        background: categoryId
          ? randomcolor({ luminosity: 'light', seed: categoryId })
          : '#00000000',
      }}
    >
      <div className="font-bold text-blue-900">Practice Makes Perfect</div>
      {!!categoryId && (
        <>
          <div
            className="cursor-pointer"
            onClick={() => navigate(`/list?categoryId=${categoryId}`)}
          >
            題目清單
          </div>
          {isAuthenticated && (
            <div
              className="cursor-pointer"
              onClick={() => navigate(`/user?categoryId=${categoryId}`)}
            >
              答題記錄
            </div>
          )}
        </>
      )}
      <div className="ml-auto">
        {!isAuthenticated ? (
          <Button
            variant="outlined"
            onClick={login}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Google登入
          </Button>
        ) : (
          <Button
            variant="outlined"
            onClick={logout}
            className="rounded-lg border bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            登出
          </Button>
        )}
      </div>
    </div>
  );
};

export default Bar;
