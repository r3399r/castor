import { Backdrop } from '@mui/material';
import { useSelector } from 'react-redux';
import IcLoader from 'src/assets/ic-loader.svg';
import type { RootState } from 'src/redux/store';

const Loader = () => {
  const { workload } = useSelector((rootState: RootState) => rootState.ui);

  return (
    <Backdrop open={workload > 0} sx={{ zIndex: 2000 }}>
      <div className="w-20 outline-none">
        <img src={IcLoader} />
      </div>
    </Backdrop>
  );
};

export default Loader;
