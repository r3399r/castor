import { useNavigate } from 'react-router-dom';
import randomcolor from 'randomcolor';
import { useSelector } from 'react-redux';
import type { RootState } from 'src/redux/store';
import { useAuth } from 'src/hooks/useAuth';
import { Button, Drawer, useMediaQuery } from '@mui/material';
import { useState } from 'react';

const Bar = () => {
  const navigate = useNavigate();
  const { categoryId } = useSelector((rootState: RootState) => rootState.ui);
  const { isAuthenticated, login, logout } = useAuth();
  const [open, setOpen] = useState<boolean>(false);
  const matches = useMediaQuery('(min-width:576px)');

  if (matches)
    return (
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{
          background: categoryId
            ? randomcolor({ luminosity: 'light', seed: categoryId })
            : '#00000000',
        }}
      >
        <div className="font-bold text-blue-900">Practice Makes Perfect</div>
        <Button variant="contained" onClick={() => navigate(`/category`)}>
          類別清單
        </Button>
        {!!categoryId && (
          <>
            <Button variant="contained" onClick={() => navigate(`/list?categoryId=${categoryId}`)}>
              題目清單
            </Button>
            {isAuthenticated && (
              <Button
                variant="contained"
                onClick={() => navigate(`/user?categoryId=${categoryId}`)}
              >
                答題記錄
              </Button>
            )}
          </>
        )}
        <div className="ml-auto">
          {!isAuthenticated ? (
            <Button variant="contained" onClick={login}>
              Google 登入
            </Button>
          ) : (
            <Button variant="contained" onClick={logout}>
              登出
            </Button>
          )}
        </div>
      </div>
    );

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
      <div className="ml-auto">
        <Button variant="contained" onClick={() => setOpen(true)}>
          Menu
        </Button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} anchor="right">
        <div className="flex w-50 flex-col gap-2 p-5">
          <Button
            variant="contained"
            onClick={() => {
              setOpen(false);
              navigate(`/category`);
            }}
          >
            類別清單
          </Button>
          {!!categoryId && (
            <>
              <Button
                variant="contained"
                onClick={() => {
                  setOpen(false);
                  navigate(`/list?categoryId=${categoryId}`);
                }}
              >
                題目清單
              </Button>
              {isAuthenticated && (
                <Button
                  variant="contained"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/user?categoryId=${categoryId}`);
                  }}
                >
                  答題記錄
                </Button>
              )}
            </>
          )}
          {!isAuthenticated ? (
            <Button variant="contained" onClick={login}>
              Google 登入
            </Button>
          ) : (
            <Button variant="contained" onClick={logout}>
              登出
            </Button>
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default Bar;
