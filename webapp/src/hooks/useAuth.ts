import { useState, useEffect } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import userEndpoint from 'src/api/userEndpoint';
import { useDispatch } from 'react-redux';
import { setIsLogin, setUser } from 'src/redux/uiSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const auth = getAuth();
  const provider = new GoogleAuthProvider();

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
        sessionStorage.removeItem('idToken');
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const login = async () => {
    try {
      await signInWithPopup(auth, provider);
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
