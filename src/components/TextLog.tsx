import { useEffect, useRef } from 'react'

interface TextLogProps {
  outputs: string[]
  maxHeight?: number
}

export default function TextLog({ outputs, maxHeight = 400 }: TextLogProps) {
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    // Auto-scroll to bottom when outputs change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [outputs])

  return (
    <pre
      ref={scrollRef}
      className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm overflow-y-auto"
      style={{ maxHeight: `${maxHeight}px` }}
    >
      {outputs.join('\n')}
    </pre>
  )
}
