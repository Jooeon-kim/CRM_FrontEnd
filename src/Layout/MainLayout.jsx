import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/authSlice'

export default function MainLayout(){
    const dispatch = useDispatch()
    const { status } = useSelector((state) => state.auth)
   
    return (
        <>
      <h1>Main Page</h1>
      <p>일반 사용자 페이지입니다.</p>
      <button onClick={() => dispatch(logout())} disabled={status === 'loading'}>
        로그아웃
      </button>
        </>
    )
    ;
}
