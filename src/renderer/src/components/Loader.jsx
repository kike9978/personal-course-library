import { cardLg } from '../ui/classes'

function Loader() {
  return (
    <div className={`${cardLg} flex flex-col items-center justify-center p-8`}>
      <div className="mb-[0.85rem] h-[52px] w-[52px] animate-loader rounded-full border-[5px] border-[rgba(23,21,28,0.12)] border-t-coral motion-reduce:animate-none" />
      <p className="animate-loader-text font-display text-md font-semibold text-ink-soft motion-reduce:animate-none">
        Cargando catálogo…
      </p>
    </div>
  )
}

export default Loader
