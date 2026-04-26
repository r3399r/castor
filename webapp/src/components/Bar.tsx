import { useNavigate } from 'react-router-dom';
import { useAuth } from 'src/hooks/useAuth';
import { Button, Drawer, useMediaQuery } from '@mui/material';
import { useState } from 'react';

const Bar = () => {
  const navigate = useNavigate();
  const { isAuthenticated, login, logout } = useAuth();
  const [open, setOpen] = useState<boolean>(false);
  const matches = useMediaQuery('(min-width:768px)');

  if (matches)
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="cursor-pointer font-bold text-blue-900" onClick={() => navigate('/')}>
          Practice Makes Perfect
        </div>
        <Button variant="contained" onClick={() => navigate('/question')}>
          題庫
        </Button>
        <Button
          variant="contained"
          onClick={() => navigate('/adaptive')}
          disabled={!isAuthenticated}
        >
          AI智慧配題
        </Button>
        <Button variant="contained" onClick={() => navigate('/user')} disabled={!isAuthenticated}>
          學習分析
        </Button>
        <Button variant="contained" onClick={() => navigate('/reply')} disabled={!isAuthenticated}>
          答題歷史
        </Button>
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
    <div className="flex items-center gap-5 px-5 py-3">
      <div className="cursor-pointer font-bold text-blue-900" onClick={() => navigate('/')}>
        Practice Makes Perfect
      </div>
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
              navigate('/question');
            }}
          >
            題庫
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setOpen(false);
              navigate('/adaptive');
            }}
            disabled={!isAuthenticated}
          >
            AI智慧配題
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setOpen(false);
              navigate('/user');
            }}
            disabled={!isAuthenticated}
          >
            學習分析
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setOpen(false);
              navigate('/reply');
            }}
            disabled={!isAuthenticated}
          >
            答題歷史
          </Button>
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
