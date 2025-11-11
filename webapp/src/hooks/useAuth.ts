import { useState, useEffect } from 'react';
import { auth, provider } from 'src/firebase/config';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useDispatch } from 'react-redux';
import { setIsLogin, setUser } from 'src/redux/uiSlice';
import userEndpoint from 'src/api/userEndpoint';
import { isInAppBrowser } from 'src/util/isInAppBrowser';

export const useAuth = () => {
  const dispatch = useDispatch();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      if (user) {
        const token = await user.getIdToken();
        setIsAuthenticated(true);
        dispatch(setIsLogin(true));
        sessionStorage.setItem('idToken', token);

        userEndpoint.postUserSync().then((res) => {
          if (res) dispatch(setUser(res.data));
        });
      } else {
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
      if (isInAppBrowser()) alert('請改用系統瀏覽器登入，如 Chrome 或 Safari');
      else await signInWithPopup(auth, provider);
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
