import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import categoryEndpoint from 'src/api/categoryEndpoint';
import type { Category as TypeCategory } from 'src/model/backend/entity/CategoryEntity';
import randomcolor from 'randomcolor';
import { finishWaiting, startWaiting } from 'src/redux/uiSlice';
import { useDispatch } from 'react-redux';

const Category = () => {
  const [category, setCategory] = useState<TypeCategory[]>();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(startWaiting());
    categoryEndpoint
      .getCategory()
      .then((res) => {
        setCategory(res?.data);
      })
      .finally(() => {
        dispatch(finishWaiting());
      });
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {category?.map((v) => (
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
  );
};

export default Category;
