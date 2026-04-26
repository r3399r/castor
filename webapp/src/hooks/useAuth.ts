import { useState, useEffect } from 'react';
import { auth, provider } from 'src/firebase/config';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useDispatch } from 'react-redux';
import { finishWaiting, setIsLogin, setUser, startWaiting } from 'src/redux/uiSlice';
import { isInAppBrowser } from 'src/util/isInAppBrowser';
import userEndpoint from 'src/api/userEndpoint';

export const useAuth = () => {
  const dispatch = useDispatch();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let initialized = false;
    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      if (user) {
        setIsAuthenticated(true);
        dispatch(setIsLogin(true));

        if (!initialized) {
          initialized = true;
          const token = await user.getIdToken();
          sessionStorage.setItem('idToken', token);

          dispatch(startWaiting());
          userEndpoint
            .postUserSync()
            .then((res) => {
              if (res) dispatch(setUser(res.data));
            })
            .finally(() => {
              dispatch(finishWaiting());
            });
        }
      } else {
        initialized = false;
        setIsAuthenticated(false);
        dispatch(setIsLogin(false));
        dispatch(setUser(null));
        sessionStorage.removeItem('idToken');
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const login = async () => {
    try {
      if (isInAppBrowser()) {
        alert(
          '為了安全性，Google 登入不支援 App 內建瀏覽器。請改用系統瀏覽器後再試一次，如 Chrome 或 Safari',
        );
      } else await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return { isAuthenticated, login, logout };
};
