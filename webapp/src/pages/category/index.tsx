import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import categoryEndpoint from 'src/api/categoryEndpoint';
import type { Category as TypeCategory } from 'src/model/backend/entity/CategoryEntity';
import randomcolor from 'randomcolor';

const Category = () => {
  const [category, setCategory] = useState<TypeCategory[]>();
  const navigate = useNavigate();

  useEffect(() => {
    categoryEndpoint.getCategory().then((res) => {
      setCategory(res?.data);
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
